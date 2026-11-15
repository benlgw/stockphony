/**
 * Shared types: the app's own data, and the shapes the backend's REST API
 * returns. The backend defines the same shapes in backend/app/models.py;
 * if one changes, change the other.
 */

/** One point on a price chart, roughly a week apart. `date` is ISO ("2024-03-15"). */
export type Point = { date: string; close: number };

/** A row in the stock database, as returned by the search endpoint. */
export type StockInfo = {
  ticker: string;
  name: string;
  /** True for companies that no longer trade. */
  delisted: boolean;
};

export type SectionId = "melody" | "bass" | "drums" | "pads" | "vocals";
export type KeyId = "cmaj" | "amin" | "ddor" | "ephr";

/** A stock that has been dropped into a section and is part of the mix. */
export type Track = {
  ticker: string;
  name: string;
  delisted: boolean;
  section: SectionId;
  instrument: string;
  key: KeyId;
  /** 0-100. Only an audio gain, so it never goes to the backend. */
  volume: number;
  /** This stock's own tempo. The backend uses it to time the notes. */
  bpm: number;
};

/* ------------------------------------------------------------------ *
 * REST API responses
 * ------------------------------------------------------------------ */

/** GET /api/stocks/{ticker}/history */
export type History = {
  ticker: string;
  /** Trading days per point. Points line up with note steps: step N is points[N]. */
  daysPerStep: number;
  points: Point[];
};

/** One note to play. */
export type Note = {
  step: number;
  /** When to play it, in ms from the start of the loop. */
  timeMs: number;
  /** MIDI note number (60 = middle C), or null for unpitched drums. */
  pitch: number | null;
  /** 0-1, how hard to play it. */
  velocity: number;
  durationMs: number;
};

/** GET /api/stocks/{ticker}/notes: every note in one loop of one track. */
export type NoteSchedule = {
  ticker: string;
  section: SectionId;
  key: KeyId;
  bpm: number;
  stepMs: number;
  loopSteps: number;
  /** The loop's length. After this, it starts again from timeMs 0. */
  loopMs: number;
  notes: Note[];
};
