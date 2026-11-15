/**
 * The single source of truth for the app: the mix, the chart data, the
 * playheads, and the conversation with the backend.
 *
 * How a stock becomes sound:
 *   1. addTrack()      puts it in the mix and asks the backend for two things:
 *   2. getHistory()    the weekly prices, for the chart
 *   3. getNotes()      every note in one loop, with the time to play each
 *   4. scheduler.set() loops those notes on the audio clock
 *   5. a frame loop    reads each track's position back for the chart playheads
 *
 * The `.svelte.ts` extension is what lets $state work outside a component.
 */

import { DEFAULT_BPM } from "$lib/core/config";
import { sectionById } from "$lib/core/sections";
import type { Point, SectionId, StockInfo, Track } from "$lib/core/types";
import { ApiError, checkHealth, getHistory, getNotes } from "$lib/services/api";
import { audio } from "$lib/services/audio";
import { scheduler } from "$lib/services/scheduler";

export type BackendState = "checking" | "online" | "offline";

class Studio {
  /* ---- Reactive state the components read ---- */

  backend = $state<BackendState>("checking");
  /** "alpaca" or "fake", as reported by the backend. Shown so a demo never runs on fake data by accident. */
  priceSource = $state<string | null>(null);
  playing = $state(false);
  tracks = $state<Track[]>([]);

  /**
   * Chart data, playheads and per-stock errors, keyed by ticker.
   *
   * $state.raw, not $state: a history is hundreds of points, and deep
   * reactivity would proxy every one of them. Raw state only updates when
   * REPLACED, which is why the code below builds new objects
   * ({ ...this.history, [ticker]: points }) instead of mutating them.
   */
  history = $state.raw<Record<string, Point[]>>({});
  playheads = $state.raw<Record<string, number>>({});
  trackErrors = $state.raw<Record<string, string>>({});

  /* ---- Private ---- */

  #frame = 0;
  /**
   * The newest notes request per ticker. If the key changes twice quickly, the
   * first response can arrive AFTER the second; comparing ids lets the stale
   * one be ignored instead of overwriting the newer notes.
   */
  #latestRequest = new Map<string, number>();
  #requestCounter = 0;

  /* ---------------- lifecycle ---------------- */

  /** Called once from App.svelte. Returns a cleanup function. */
  init(): () => void {
    void this.#checkBackend();
    scheduler.start();

    const frame = () => {
      this.#updatePlayheads();
      this.#frame = requestAnimationFrame(frame);
    };
    this.#frame = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(this.#frame);
      scheduler.stop();
    };
  }

  async #checkBackend(): Promise<void> {
    try {
      const health = await checkHealth();
      this.backend = "online";
      this.priceSource = health.priceSource;
    } catch {
      this.backend = "offline";
    }
  }

  /**
   * Copies each track's position from the scheduler into reactive state,
   * once per screen refresh, and only when a step actually changed.
   */
  #updatePlayheads(): void {
    if (!this.playing) return;
    let changed = false;
    const next = { ...this.playheads };
    for (const track of this.tracks) {
      const step = scheduler.step(track.ticker);
      if (step !== null && next[track.ticker] !== step) {
        next[track.ticker] = step;
        changed = true;
      }
    }
    if (changed) this.playheads = next;
  }

  /* ---------------- transport ---------------- */

  /**
   * Must be called from a real click: browsers block audio until the user
   * interacts with the page, which is why this lives on the play button.
   */
  async play(): Promise<void> {
    await audio.start();
    for (const track of this.tracks) audio.setTrackVolume(track.ticker, track.volume);
    this.playing = true;
  }

  async pause(): Promise<void> {
    await audio.suspend();
    this.playing = false;
  }

  restart(): void {
    scheduler.restart();
    this.playheads = {};
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

    const track: Track = {
      ticker: stock.ticker,
      name: stock.name,
      delisted: stock.delisted,
      section,
      instrument: sectionById(section).instruments[0],
      key: "amin",
      volume: 75,
      bpm: DEFAULT_BPM,
      leverage: 1,
    };
    this.tracks = [...this.tracks, track];
    audio.setTrackVolume(track.ticker, track.volume);
    // Build its instrument now, not on its first note mid-playback.
    audio.prepare(track.ticker, track.instrument);
    void this.#load(track);
  }

  removeTrack(ticker: string): void {
    this.tracks = this.tracks.filter((t) => t.ticker !== ticker);
    this.#latestRequest.delete(ticker);
    scheduler.remove(ticker);
    audio.removeTrack(ticker);

    // Drop the chart data too, or long sessions leak memory.
    const { [ticker]: _history, ...history } = this.history;
    const { [ticker]: _head, ...playheads } = this.playheads;
    const { [ticker]: _error, ...trackErrors } = this.trackErrors;
    this.history = history;
    this.playheads = playheads;
    this.trackErrors = trackErrors;
  }

  /**
   * Patches one track.
   *  - volume:     audio only, nothing to fetch
   *  - instrument: changes the sound but not the timing, so no refetch
   *  - key, bpm, leverage: change which notes play and when, so new notes are fetched
   *
   * `sync: false` updates the screen without fetching. The BPM slider fires
   * an event for every pixel it moves, so it uses this while dragging and
   * only fetches once, on release.
   */
  updateTrack(
    ticker: string,
    patch: Partial<Pick<Track, "instrument" | "key" | "volume" | "bpm" | "leverage">>,
    { sync = true }: { sync?: boolean } = {},
  ): void {
    this.tracks = this.tracks.map((t) => (t.ticker === ticker ? { ...t, ...patch } : t));
    const track = this.tracks.find((t) => t.ticker === ticker);
    if (!track) return;

    if (patch.volume !== undefined) audio.setTrackVolume(ticker, patch.volume);
    if (patch.instrument !== undefined) {
      scheduler.setInstrument(ticker, patch.instrument);
      audio.prepare(ticker, patch.instrument);
    }
    if (sync && (patch.key !== undefined || patch.bpm !== undefined || patch.leverage !== undefined)) {
      void this.#loadNotes(track).catch((error) => this.#trackFailed(ticker, error));
    }
  }

  /* ---------------- talking to the backend ---------------- */

  /** Fetches the chart and the notes together; the backend caches both from one price fetch. */
  async #load(track: Track): Promise<void> {
    try {
      const [history] = await Promise.all([getHistory(track.ticker), this.#loadNotes(track)]);
      if (!this.hasTrack(track.ticker)) return; // removed while loading
      this.history = { ...this.history, [track.ticker]: history.points };
    } catch (error) {
      this.#trackFailed(track.ticker, error);
    }
  }

  async #loadNotes(track: Track): Promise<void> {
    const id = ++this.#requestCounter;
    this.#latestRequest.set(track.ticker, id);

    // Leverage happens here: the backend just sees a (possibly very fast) BPM.
    const bpm = track.bpm * track.leverage;
    const schedule = await getNotes(track.ticker, track.section, track.key, bpm);
    this.backend = "online";

    // Ignore the answer if the track was removed, or a newer request was made.
    if (this.#latestRequest.get(track.ticker) !== id) return;

    // Read the instrument now, not from `track`: it may have changed while
    // the request was in flight.
    const current = this.tracks.find((t) => t.ticker === track.ticker);
    if (!current) return;
    scheduler.set(track.ticker, schedule, current.instrument);

    if (this.trackErrors[track.ticker]) {
      const { [track.ticker]: _cleared, ...rest } = this.trackErrors;
      this.trackErrors = rest;
    }
  }

  #trackFailed(ticker: string, error: unknown): void {
    if (!this.hasTrack(ticker)) return;
    const message = error instanceof Error ? error.message : "Something went wrong.";
    if (error instanceof ApiError && error.status === 0) this.backend = "offline";
    this.trackErrors = { ...this.trackErrors, [ticker]: message };
  }
}

/** One instance, imported wherever it is needed. */
export const studio = new Studio();
