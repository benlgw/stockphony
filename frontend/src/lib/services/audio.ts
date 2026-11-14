/**
 * Web Audio playback.
 *
 * The backend decides WHEN to play; this file decides WHAT it sounds like.
 * One AudioContext for the whole app, one gain node per track, so adding
 * stocks scales: each new track is two extra nodes, not a new audio graph.
 *
 * Why Web Audio rather than <audio> elements or a library like Tone.js:
 * notes have to land at an exact moment, and only Web Audio lets you schedule
 * ahead on the audio clock. Tone.js would also work and has nicer instruments,
 * but it wants to own the transport, which here belongs to the backend.
 */

import type { ServerMessage } from "$lib/core/types";

type NoteMessage = Extract<ServerMessage, { type: 'note' }>;

/** How each instrument name maps onto a basic synth voice. */
type Voice = {
  wave: OscillatorType;
  /** Seconds to fade in. Short = percussive, long = soft pad. */
  attack: number;
  /** Seconds to fade out after the note's duration. */
  release: number;
  /** Low-pass cutoff in Hz, to stop saw waves sounding harsh. */
  cutoff: number;
  /** Unpitched voices play a noise burst instead of a tone. */
  noise?: boolean;
};

const VOICES: Record<string, Voice> = {
  'Saw synth': { wave: 'sawtooth', attack: 0.01, release: 0.25, cutoff: 2600 },
  Piano: { wave: 'triangle', attack: 0.004, release: 0.45, cutoff: 4000 },
  'Glass bells': { wave: 'sine', attack: 0.002, release: 1.1, cutoff: 7000 },
  Pluck: { wave: 'triangle', attack: 0.002, release: 0.18, cutoff: 3200 },
  Flute: { wave: 'sine', attack: 0.08, release: 0.3, cutoff: 3000 },
  'Wobble bass': { wave: 'sawtooth', attack: 0.01, release: 0.2, cutoff: 700 },
  'Sub bass': { wave: 'sine', attack: 0.015, release: 0.3, cutoff: 400 },
  'Slap bass': { wave: 'square', attack: 0.004, release: 0.16, cutoff: 1400 },
  'Upright bass': { wave: 'triangle', attack: 0.02, release: 0.4, cutoff: 600 },
  'Warm strings': { wave: 'sawtooth', attack: 0.35, release: 0.9, cutoff: 1800 },
  'Brass section': { wave: 'sawtooth', attack: 0.09, release: 0.5, cutoff: 2200 },
  'Choir pad': { wave: 'sine', attack: 0.4, release: 1.2, cutoff: 2000 },
  'Space pad': { wave: 'triangle', attack: 0.5, release: 1.6, cutoff: 1500 },
  'Vocal chops': { wave: 'sawtooth', attack: 0.02, release: 0.3, cutoff: 2400 },
  'Choir hits': { wave: 'sine', attack: 0.03, release: 0.6, cutoff: 2600 },
  'Robot voice': { wave: 'square', attack: 0.01, release: 0.25, cutoff: 1800 },
  'Crowd cheer': { wave: 'sine', attack: 0.05, release: 0.7, cutoff: 3000, noise: true },
  '808 kit': { wave: 'sine', attack: 0.001, release: 0.3, cutoff: 1200, noise: true },
  'Rock kit': { wave: 'sine', attack: 0.001, release: 0.22, cutoff: 3000, noise: true },
  'Lo-fi kit': { wave: 'sine', attack: 0.002, release: 0.26, cutoff: 1600, noise: true },
  'Toy box': { wave: 'square', attack: 0.001, release: 0.15, cutoff: 5000, noise: true },
};

const FALLBACK: Voice = { wave: 'triangle', attack: 0.01, release: 0.3, cutoff: 2500 };

/** MIDI note number to frequency. 69 is A4 = 440Hz, 12 semitones per octave. */
const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class AudioEngine {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  /** One gain node per ticker, so each track's volume slider is independent. */
  #trackGains = new Map<string, GainNode>();
  /** Cached white-noise buffer, reused by every percussive hit. */
  #noise: AudioBuffer | null = null;

  /**
   * Browsers refuse to start audio until the user interacts with the page,
   * so this must be called from a click handler (the play button does it).
   */
  async start(): Promise<void> {
    if (!this.#ctx) {
      this.#ctx = new AudioContext();
      this.#master = this.#ctx.createGain();
      this.#master.gain.value = 0.7; // headroom, so several tracks don't clip
      this.#master.connect(this.#ctx.destination);
    }
    if (this.#ctx.state === 'suspended') await this.#ctx.resume();
  }

  get running(): boolean {
    return this.#ctx?.state === 'running';
  }

  /** Create (or fetch) the gain node for a track. */
  #gainFor(ticker: string): GainNode | null {
    if (!this.#ctx || !this.#master) return null;
    let gain = this.#trackGains.get(ticker);
    if (!gain) {
      gain = this.#ctx.createGain();
      gain.connect(this.#master);
      this.#trackGains.set(ticker, gain);
    }
    return gain;
  }

  /** Volume slider, 0-100. Squared because loudness is perceived non-linearly. */
  setTrackVolume(ticker: string, volume: number): void {
    const gain = this.#gainFor(ticker);
    if (gain && this.#ctx) {
      const level = (volume / 100) ** 2;
      // setTargetAtTime ramps instead of jumping, which avoids clicks.
      gain.gain.setTargetAtTime(level, this.#ctx.currentTime, 0.02);
    }
  }

  removeTrack(ticker: string): void {
    this.#trackGains.get(ticker)?.disconnect();
    this.#trackGains.delete(ticker);
  }

  #noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.#noise) {
      const frames = ctx.sampleRate; // one second is plenty for short hits
      this.#noise = ctx.createBuffer(1, frames, ctx.sampleRate);
      const channel = this.#noise.getChannelData(0);
      for (let i = 0; i < frames; i++) channel[i] = Math.random() * 2 - 1;
    }
    return this.#noise;
  }

  /**
   * Play one note from the backend.
   *
   * `inMs` is how far in the future the note should sound. Everything is
   * scheduled against ctx.currentTime (the audio clock), which is far steadier
   * than setTimeout, so notes land where they should even if the main thread
   * is busy redrawing charts.
   */
  play(message: NoteMessage, instrument: string): void {
    const ctx = this.#ctx;
    const out = this.#gainFor(message.ticker);
    if (!ctx || !out || ctx.state !== 'running') return;

    const voice = VOICES[instrument] ?? FALLBACK;
    const at = ctx.currentTime + Math.max(0, message.inMs ?? 0) / 1000;
    const seconds = Math.max(0.03, message.durationMs / 1000);
    const peak = Math.max(0, Math.min(1, message.velocity));

    // Shared shaping: a low-pass filter plus an envelope (fade in, hold, fade out).
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.cutoff;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + voice.attack);
    envelope.gain.setValueAtTime(peak, at + seconds);
    // Exponential decay sounds natural, but cannot reach exactly zero.
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds + voice.release);

    filter.connect(envelope);
    envelope.connect(out);

    const stopAt = at + seconds + voice.release;

    if (message.pitch === null || voice.noise) {
      // Unpitched: a burst of noise, plus a short tone for the body of a drum.
      const noise = ctx.createBufferSource();
      noise.buffer = this.#noiseBuffer(ctx);
      noise.connect(filter);
      noise.start(at);
      noise.stop(stopAt);

      if (message.pitch !== null) {
        const body = ctx.createOscillator();
        body.type = voice.wave;
        body.frequency.value = midiToHz(message.pitch);
        body.connect(filter);
        body.start(at);
        body.stop(stopAt);
      }
    } else {
      const osc = ctx.createOscillator();
      osc.type = voice.wave;
      osc.frequency.value = midiToHz(message.pitch);
      osc.connect(filter);
      osc.start(at);
      osc.stop(stopAt);
      // Nodes disconnect themselves once stopped, so there is nothing to clean up.
    }
  }

  /** Called when transport pauses: silences anything still ringing. */
  async suspend(): Promise<void> {
    if (this.#ctx?.state === 'running') await this.#ctx.suspend();
  }
}

export const audio = new AudioEngine();
