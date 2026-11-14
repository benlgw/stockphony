/**
 * Shared types for the app and, more importantly, the WebSocket protocol.
 * This file is the contract between this frontend and the Python backend:
 * if you change a message shape here, tell whoever owns the backend.
 */

/** One point on a price chart. `date` is ISO ("2024-03-15"), `close` is the closing price. */
export type Point = { date: string; close: number };

/** A row in the stock database, as returned by the search endpoint. */
export type StockInfo = {
  ticker: string;
  name: string;
  /** True for companies that no longer trade (Lehman, Enron, Blockbuster...). */
  delisted: boolean;
};

export type SectionId = 'melody' | 'bass' | 'drums' | 'pads' | 'vocals';
export type KeyId = 'cmaj' | 'amin' | 'ddor' | 'ephr';

/** A stock that has been dropped into a section and is part of the mix. */
export type Track = {
  ticker: string;
  name: string;
  delisted: boolean;
  section: SectionId;
  instrument: string;
  key: KeyId;
  /** 0-100. Stays on the client: it is just an audio gain, the backend does not need it. */
  volume: number;
  /**
   * This stock's own tempo. Each track runs on its own clock, so the backend
   * needs it to schedule that track's notes.
   */
  bpm: number;
};

/* ------------------------------------------------------------------ *
 * Backend -> frontend
 * ------------------------------------------------------------------ */

export type ServerMessage =
  /** Sent once on connect so the UI can show the backend's real transport state. */
  | { type: 'ready'; playing: boolean }
  /** Full price history for a ticker, sent after the frontend adds it. Drives the chart. */
  | { type: 'history'; ticker: string; points: Point[] }
  /**
   * "Play a sound now." The backend decides when each track sounds, so this is
   * the only thing that makes noise.
   *  - step:       which index of that stock's history this note represents, so
   *                the frontend can move the chart playhead in time with the audio.
   *  - pitch:      MIDI note number, or null for unpitched sections such as drums.
   *  - velocity:   0-1, how hard to hit it.
   *  - durationMs: how long the note rings for.
   *  - inMs:       optional. How far in the FUTURE to play it, measured from arrival.
   *                Sending notes ~100ms early and scheduling them precisely is what
   *                keeps the timing tight. It is relative on purpose: the two machines'
   *                clocks do not have to agree on the time of day.
   */
  | {
      type: 'note';
      ticker: string;
      step: number;
      pitch: number | null;
      velocity: number;
      durationMs: number;
      inMs?: number;
    }
  /** Transport changed (possibly by another client, or by the backend itself). */
  | { type: 'transport'; playing: boolean }
  /** Something went wrong with a request. Shown in the UI, not thrown away. */
  | { type: 'error'; message: string };

/* ------------------------------------------------------------------ *
 * Frontend -> backend
 * ------------------------------------------------------------------ */

export type ClientMessage =
  /** Add a stock to the mix. The backend starts sending notes and history for it. */
  | {
      type: 'addTrack';
      ticker: string;
      section: SectionId;
      instrument: string;
      key: KeyId;
      bpm: number;
    }
  /** Remove it again: stop sending notes for this ticker. */
  | { type: 'removeTrack'; ticker: string }
  /**
   * Instrument, key or tempo changed. Only the fields that changed are sent.
   * Key affects which notes the backend picks; bpm how often it sends them.
   */
  | { type: 'updateTrack'; ticker: string; instrument?: string; key?: KeyId; bpm?: number }
  | { type: 'setTransport'; playing: boolean }
  /** Send every loop back to its first step. */
  | { type: 'restart' };
