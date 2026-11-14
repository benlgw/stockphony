/**
 * The single source of truth for the app: the WebSocket connection, the mix,
 * and the chart data, in one reactive class.
 *
 * Why one class rather than several small stores: the three things are
 * inseparable. Adding a track sends a message, which produces history, which
 * produces notes, which move that track's playhead. Splitting them across
 * modules would mean importing each from the other.
 *
 * The `.svelte.ts` extension is what lets $state work outside a component.
 */

import { audio } from "$lib/services/audio";
import { MAX_RECONNECT_MS, USE_MOCK, WS_URL } from "$lib/core/config";
import { mockHistory } from "$lib/services/mock";
import { sectionById } from "$lib/core/sections";
import type { ClientMessage, KeyId, Point, SectionId, ServerMessage, StockInfo, Track } from "$lib/core/types";

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'mock';

class Studio {
  /* ---- Reactive state the components read ---- */

  connection = $state<ConnectionState>(USE_MOCK ? 'mock' : 'connecting');
  playing = $state(false);
  bpm = $state(120);
  tracks = $state<Track[]>([]);
  /** Last error from the backend, shown in the panel rather than swallowed. */
  lastError = $state<string | null>(null);

  /**
   * Chart data and playheads, keyed by ticker.
   *
   * $state.raw, not $state: a full history can be thousands of points, and deep
   * reactivity would proxy every one of them. Raw state is only reactive when
   * REPLACED, which is why the handlers below build a new object instead of
   * mutating ({ ...this.history, [ticker]: points }).
   */
  history = $state.raw<Record<string, Point[]>>({});
  playheads = $state.raw<Record<string, number>>({});

  /* ---- Private connection plumbing ---- */

  #socket: WebSocket | null = null;
  #retries = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  /** Batches playhead updates to one per animation frame; see #movePlayhead. */
  #pendingHeads: Record<string, number> | null = null;

  /* ---------------- connection ---------------- */

  connect(): void {
    if (USE_MOCK) return; // nothing to connect to in demo mode

    this.connection = 'connecting';
    const socket = new WebSocket(WS_URL);
    this.#socket = socket;

    socket.onopen = () => {
      this.connection = 'open';
      this.#retries = 0;
      // Re-register every track. A reconnect leaves the backend with no idea
      // what this client had in its mix, so without this the music never restarts.
      for (const track of this.tracks) {
        this.#send({
          type: 'addTrack',
          ticker: track.ticker,
          section: track.section,
          instrument: track.instrument,
          key: track.key,
        });
      }
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        this.#handle(JSON.parse(event.data) as ServerMessage);
      } catch {
        // A malformed frame should not kill the connection.
        this.lastError = 'Received a message the frontend could not read.';
      }
    };

    socket.onclose = () => {
      this.connection = 'closed';
      // Exponential backoff: 1s, 2s, 4s... so a backend restart does not get
      // hammered by a reconnect loop.
      const wait = Math.min(MAX_RECONNECT_MS, 1000 * 2 ** this.#retries++);
      this.#reconnectTimer = setTimeout(() => this.connect(), wait);
    };

    // onerror always precedes onclose, so reconnection is handled there.
    socket.onerror = () => socket.close();
  }

  disconnect(): void {
    clearTimeout(this.#reconnectTimer);
    const socket = this.#socket;
    this.#socket = null;
    if (socket) {
      socket.onclose = null; // stop the reconnect we are about to trigger
      socket.close();
    }
  }

  #send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  /* ---------------- incoming messages ---------------- */

  #handle(message: ServerMessage): void {
    switch (message.type) {
      case 'ready':
      case 'transport':
        this.playing = message.playing;
        this.bpm = message.bpm;
        break;

      case 'history':
        this.history = { ...this.history, [message.ticker]: message.points };
        break;

      case 'note': {
        const track = this.tracks.find((t) => t.ticker === message.ticker);
        if (!track) return; // a note for something we just removed
        audio.play(message, track.instrument);
        this.#movePlayhead(message.ticker, message.step, message.inMs ?? 0);
        break;
      }

      case 'error':
        this.lastError = message.message;
        break;
    }
  }

  /**
   * Moves a chart playhead in time with its note.
   *
   * At 200bpm with ten stocks, notes arrive faster than the screen refreshes.
   * Writing to reactive state on every one would queue dozens of redraws per
   * frame, so updates are collected and flushed once per animation frame.
   */
  #movePlayhead(ticker: string, step: number, delayMs: number): void {
    const apply = () => {
      this.#pendingHeads ??= {};
      this.#pendingHeads[ticker] = step;
      if (Object.keys(this.#pendingHeads).length === 1) {
        requestAnimationFrame(() => {
          this.playheads = { ...this.playheads, ...this.#pendingHeads };
          this.#pendingHeads = null;
        });
      }
    };
    // Notes are sent slightly early; the visual should wait too, or the
    // playhead runs ahead of the sound.
    if (delayMs > 0) setTimeout(apply, delayMs);
    else apply();
  }

  /* ---------------- transport ---------------- */

  /**
   * Must be called from a real click: browsers block audio until the user
   * interacts with the page, which is why this lives on the play button and
   * not in an effect somewhere.
   */
  async play(): Promise<void> {
    await audio.start();
    for (const track of this.tracks) audio.setTrackVolume(track.ticker, track.volume);
    this.playing = true;
    this.#send({ type: 'setTransport', playing: true });
  }

  async pause(): Promise<void> {
    await audio.suspend();
    this.playing = false;
    this.#send({ type: 'setTransport', playing: false });
  }

  restart(): void {
    this.playheads = {};
    this.#send({ type: 'restart' });
  }

  setTempo(bpm: number): void {
    this.bpm = bpm;
    this.#send({ type: 'setTempo', bpm });
  }

  /* ---------------- the mix ---------------- */

  hasTrack(ticker: string): boolean {
    return this.tracks.some((t) => t.ticker === ticker);
  }

  tracksIn(section: SectionId): Track[] {
    return this.tracks.filter((t) => t.section === section);
  }

  addTrack(stock: StockInfo, section: SectionId): void {
    if (this.hasTrack(stock.ticker)) return;

    const def = sectionById(section);
    const track: Track = {
      ticker: stock.ticker,
      name: stock.name,
      delisted: stock.delisted,
      section,
      instrument: def.instruments[0],
      key: 'amin',
      volume: 75,
    };

    this.tracks = [...this.tracks, track];
    audio.setTrackVolume(track.ticker, track.volume);
    this.#send({
      type: 'addTrack',
      ticker: track.ticker,
      section,
      instrument: track.instrument,
      key: track.key,
    });

    if (USE_MOCK) {
      this.history = { ...this.history, [track.ticker]: mockHistory(track.ticker) };
    }
  }

  removeTrack(ticker: string): void {
    this.tracks = this.tracks.filter((t) => t.ticker !== ticker);
    audio.removeTrack(ticker);
    this.#send({ type: 'removeTrack', ticker });

    // Drop the chart data too, or long sessions leak memory.
    const { [ticker]: _history, ...restHistory } = this.history;
    const { [ticker]: _head, ...restHeads } = this.playheads;
    this.history = restHistory;
    this.playheads = restHeads;
  }

  /** Patches one track. Volume is client-side; instrument and key go to the backend. */
  updateTrack(ticker: string, patch: Partial<Pick<Track, 'instrument' | 'key' | 'volume'>>): void {
    this.tracks = this.tracks.map((t) => (t.ticker === ticker ? { ...t, ...patch } : t));

    if (patch.volume !== undefined) audio.setTrackVolume(ticker, patch.volume);
    if (patch.instrument !== undefined || patch.key !== undefined) {
      this.#send({
        type: 'updateTrack',
        ticker,
        instrument: patch.instrument,
        key: patch.key as KeyId | undefined,
      });
    }
  }
}

/** One instance, imported wherever it is needed. */
export const studio = new Studio();
