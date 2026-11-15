/**
 * Plays every track's notes on time, each looping on its own length.
 *
 * The backend sends each track's notes as times from the start of its loop
 * (timeMs). This file turns those into "play at audio-clock time X" calls.
 *
 * It uses the standard Web Audio pattern for steady timing: a timer wakes up
 * every 25ms and queues any notes due in the next 150ms, each scheduled at its
 * exact time on the audio clock. Timers in JavaScript are sloppy (they can
 * fire late when the page is busy), but because every note is queued ahead
 * with an exact time, the sloppiness never reaches the rhythm.
 */

import { audio } from "./audio";
import type { NoteSchedule } from "$lib/core/types";

const TICK_MS = 25;
/** How far ahead to queue notes. Must comfortably exceed TICK_MS. */
const LOOKAHEAD_S = 0.15;
/** A brief gap before a new loop starts, so its first note isn't already late. */
const START_DELAY_S = 0.05;
/** Notes this late are dropped instead of played (e.g. after the tab was hidden). */
const LATE_S = 0.25;

type Playing = {
  schedule: NoteSchedule;
  instrument: string;
  /** Audio-clock time of this track's first loop starting. */
  loopStart: number;
  /** Which repetition of the loop the next note belongs to. */
  loop: number;
  /** Index of the next note to queue. */
  index: number;
};

class Scheduler {
  #tracks = new Map<string, Playing>();
  #timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.#timer ??= setInterval(() => this.#tick(), TICK_MS);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  /**
   * Adds a track, or swaps in new notes for one already playing (after a key
   * or BPM change). A swapped track keeps its place: if it was on step 120,
   * it carries on from step 120 at the new tempo rather than jumping to 0.
   */
  set(ticker: string, schedule: NoteSchedule, instrument: string): void {
    const now = audio.time;
    const existing = this.#tracks.get(ticker);

    let loopStart = now + START_DELAY_S;
    if (existing) {
      const step = this.#position(existing, now);
      loopStart = now - (step * schedule.stepMs) / 1000;
    }

    const track: Playing = { schedule, instrument, loopStart, loop: 0, index: 0 };
    this.#seek(track, now);
    this.#tracks.set(ticker, track);
  }

  /** Instrument only changes the sound, not the timing, so no refetch is needed. */
  setInstrument(ticker: string, instrument: string): void {
    const track = this.#tracks.get(ticker);
    if (track) track.instrument = instrument;
  }

  remove(ticker: string): void {
    this.#tracks.delete(ticker);
  }

  /** Sends every loop back to its first step. */
  restart(): void {
    const start = audio.time + START_DELAY_S;
    for (const track of this.#tracks.values()) {
      track.loopStart = start;
      track.loop = 0;
      track.index = 0;
    }
  }

  /** The step a track is on right now, for its chart playhead. Null if not loaded. */
  step(ticker: string): number | null {
    const track = this.#tracks.get(ticker);
    return track ? Math.floor(this.#position(track, audio.time)) : null;
  }

  /** Where in its loop a track is, in (fractional) steps. */
  #position(track: Playing, now: number): number {
    const loopS = track.schedule.loopMs / 1000;
    const elapsed = now - track.loopStart;
    if (loopS <= 0 || elapsed < 0) return 0;
    return (elapsed % loopS) / (track.schedule.stepMs / 1000);
  }

  /** Points a track at the first note that is still in the future. */
  #seek(track: Playing, now: number): void {
    const loopS = track.schedule.loopMs / 1000;
    const elapsed = Math.max(0, now - track.loopStart);
    track.loop = loopS > 0 ? Math.floor(elapsed / loopS) : 0;
    const intoLoopMs = (elapsed - track.loop * loopS) * 1000;
    const next = track.schedule.notes.findIndex((note) => note.timeMs >= intoLoopMs);
    if (next === -1) {
      // Past the last note: the next one is the first note of the next loop.
      track.loop += 1;
      track.index = 0;
    } else {
      track.index = next;
    }
  }

  #tick(): void {
    if (!audio.running) return; // paused: the audio clock is frozen anyway
    const now = audio.time;
    const horizon = now + LOOKAHEAD_S;

    for (const [ticker, track] of this.#tracks) {
      const { notes, loopMs } = track.schedule;
      if (notes.length === 0 || loopMs <= 0) continue;
      const loopS = loopMs / 1000;

      // Queue every note that falls before the horizon.
      for (;;) {
        const note = notes[track.index];
        const at = track.loopStart + track.loop * loopS + note.timeMs / 1000;
        if (at > horizon) break;

        if (at < now - LATE_S) {
          // Far behind (the browser throttles timers in hidden tabs). Skip to
          // the present instead of playing a burst of stale notes at once.
          this.#seek(track, now);
          continue;
        }

        audio.play(ticker, note, track.instrument, Math.max(at, now));
        track.index += 1;
        if (track.index >= notes.length) {
          track.index = 0;
          track.loop += 1;
        }
      }
    }
  }
}

export const scheduler = new Scheduler();
