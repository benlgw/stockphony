/**
 * Sound, using Tone.js.
 *
 * The backend decides WHEN notes play, the scheduler decides when to queue
 * them, and this file decides what they SOUND like.
 *
 * The previous version built every sound by hand from raw Web Audio pieces:
 * one oscillator, one filter, one fade. Tone.js provides ready-made
 * instruments built from many of those pieces at once (FM synthesis for bells
 * and pianos, pitch-swept drums, detuned "fat" oscillators for strings), plus
 * effects like reverb. Everything is still generated live in the browser:
 * no audio files, so it works offline.
 *
 * The functions here (start, time, running, play, setTrackVolume, removeTrack,
 * suspend) are the same as before, so nothing else in the app had to change.
 *
 * Signal path:  instrument -> track volume -> master -> reverb -> soft clipper -> speakers
 */

import * as Tone from "tone";
import type { Note } from "$lib/core/types";

/** MIDI note number to frequency: 69 is A4 = 440Hz, 12 semitones per octave. */
const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** How loud a track gets at 100% volume (see setTrackVolume). */
const MAX_TRACK_GAIN = 1.8;
const MASTER_GAIN = 1.2;
/**
 * Volume slider (0-100) to gain. Squared because hearing is roughly
 * logarithmic: with a straight line, the top half of the slider would barely
 * change anything.
 */
const gainFor = (volume: number) => (volume / 100) ** 2 * MAX_TRACK_GAIN;

/** How much headroom the soft clipper has before it starts bending peaks. */
const CLIP_HEADROOM = 3;

/* ------------------------------------------------------------------ *
 * Instruments
 *
 * Each instrument is a small object with trigger(note, at): play this note
 * at this audio-clock time. Drum kits are two synths in one (kick and hat);
 * the note's pitch decides which plays: drums send pitch 36 for a kick and
 * null for a hat.
 *
 * The `volume` values (in decibels) balance the instruments against each
 * other. They were measured, not guessed: every instrument played the same
 * test pattern, and each was set so its section comes out equally loud
 * (pads a little quieter, so they sit behind). Tone's instruments are much
 * quieter than raw oscillators, which is why most of these are above 0.
 * ------------------------------------------------------------------ */

type Voice = {
  output: Tone.ToneAudioNode;
  trigger(note: Note, at: number): void;
  dispose(): void;
};

/** Anything with Tone's usual triggerAttackRelease(note, duration, time, velocity). */
type Playable = Tone.ToneAudioNode & {
  triggerAttackRelease(note: Tone.Unit.Frequency, duration: Tone.Unit.Time, time?: Tone.Unit.Time, velocity?: number): unknown;
};

/** A pitched instrument: plays every note at its MIDI pitch. */
function pitched(synth: Playable, through?: Tone.ToneAudioNode): Voice {
  if (through) synth.connect(through);
  return {
    output: through ?? synth,
    trigger(note, at) {
      if (note.pitch === null) return;
      synth.triggerAttackRelease(midiToHz(note.pitch), note.durationMs / 1000, at, note.velocity);
    },
    dispose() {
      synth.dispose();
      through?.dispose();
    },
  };
}

/** A drum kit: pitch 36 (or any pitch) plays the kick, null plays the hat. */
function drumKit(kick: Tone.MembraneSynth, hat: Tone.MetalSynth | Tone.NoiseSynth, kickShift = 0): Voice {
  const output = new Tone.Gain();
  kick.connect(output);
  hat.connect(output);
  return {
    output,
    trigger(note, at) {
      const seconds = note.durationMs / 1000;
      if (note.pitch !== null) {
        kick.triggerAttackRelease(midiToHz(note.pitch + kickShift), seconds, at, note.velocity);
      } else if (hat instanceof Tone.NoiseSynth) {
        hat.triggerAttackRelease(seconds, at, note.velocity);
      } else {
        hat.triggerAttackRelease(300, seconds, at, note.velocity);
      }
    },
    dispose() {
      kick.dispose();
      hat.dispose();
      output.dispose();
    },
  };
}

/** A noise instrument: ignores pitch entirely (the crowd doesn't sing in key). */
function noise(synth: Tone.NoiseSynth): Voice {
  return {
    output: synth,
    trigger(note, at) {
      synth.triggerAttackRelease(note.durationMs / 1000, at, note.velocity);
    },
    dispose() {
      synth.dispose();
    },
  };
}

const INSTRUMENTS: Record<string, () => Voice> = {
  /* ---- Melody ---- */
  "Saw synth": () =>
    pitched(new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 25 },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.25 },
      volume: 6,
    })),
  Piano: () =>
    pitched(new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 3.5,
      envelope: { attack: 0.002, decay: 0.9, sustain: 0.05, release: 0.8 },
      modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 },
      volume: 7,
    })),
  "Glass bells": () =>
    pitched(new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 12,
      envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 },
      modulationEnvelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.6 },
      volume: 5,
    })),
  // A physical model of a plucked string. One string, so a new note cuts
  // off the last one, like plucking the same string again.
  Pluck: () => pitched(new Tone.PluckSynth({ attackNoise: 1, dampening: 3500, resonance: 0.92, volume: 18 })),
  Flute: () =>
    pitched(new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 1.5,
      envelope: { attack: 0.06, decay: 0.1, sustain: 0.8, release: 0.3 },
      volume: 9,
    })),

  /* ---- Bass: one note at a time, like a real bass ---- */
  "Wobble bass": () =>
    pitched(new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      filter: { type: "lowpass", Q: 8 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.2 },
      filterEnvelope: { attack: 0.05, decay: 0.25, sustain: 0.2, release: 0.2, baseFrequency: 60, octaves: 4 },
      volume: -7,
    })),
  "Sub bass": () =>
    pitched(new Tone.MonoSynth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.3 },
      filterEnvelope: { baseFrequency: 300, octaves: 0 },
      volume: -9,
    })),
  "Slap bass": () =>
    pitched(new Tone.MonoSynth({
      oscillator: { type: "square" },
      filter: { type: "lowpass", Q: 3 },
      envelope: { attack: 0.002, decay: 0.15, sustain: 0.2, release: 0.1 },
      filterEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.1, baseFrequency: 200, octaves: 3.5 },
      volume: 1,
    })),
  "Upright bass": () =>
    pitched(new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 0.4 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.3, baseFrequency: 300, octaves: 1.5 },
      volume: 6,
    })),

  /* ---- Drums: a kick that sweeps down in pitch, plus a hat ---- */
  "808 kit": () =>
    drumKit(
      new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 8, envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 }, volume: 5 }),
      new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.08, release: 0.02 }, harmonicity: 5.1, modulationIndex: 32, resonance: 6000, octaves: 1.5, volume: -19 }),
    ),
  "Rock kit": () =>
    drumKit(
      new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 5, envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 }, volume: 8 }),
      new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 }, volume: -6 }),
    ),
  "Lo-fi kit": () =>
    drumKit(
      new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 4, envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.2 }, volume: 5 }),
      new Tone.NoiseSynth({ noise: { type: "brown" }, envelope: { attack: 0.002, decay: 0.07, sustain: 0, release: 0.05 }, volume: 1 }),
    ),
  "Toy box": () =>
    drumKit(
      new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, volume: 12 }),
      new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.02 }, harmonicity: 12, modulationIndex: 20, resonance: 8000, octaves: 1, volume: -2 }),
      24, // two octaves up: a tiny toy drum
    ),

  /* ---- Pads: slow, overlapping chords ---- */
  "Warm strings": () =>
    pitched(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 40 },
        envelope: { attack: 0.6, decay: 0.4, sustain: 0.7, release: 1.6 },
        volume: -2,
      }),
      new Tone.Filter(1800, "lowpass"),
    ),
  "Brass section": () =>
    pitched(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 2, spread: 15 },
        envelope: { attack: 0.12, decay: 0.3, sustain: 0.6, release: 0.6 },
        volume: -1,
      }),
      new Tone.Filter(2500, "lowpass"),
    ),
  "Choir pad": () =>
    pitched(new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2,
      envelope: { attack: 0.8, decay: 0.3, sustain: 0.8, release: 2 },
      volume: 5,
    })),
  "Space pad": () =>
    pitched(new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 0.5,
      modulationIndex: 2,
      envelope: { attack: 1.2, decay: 0.5, sustain: 0.8, release: 3 },
      volume: 0,
    })),

  /* ---- Vocals: rare, so they can afford to be big ---- */
  "Vocal chops": () =>
    pitched(new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1,
      modulationIndex: 6,
      modulation: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.3 },
      volume: 8,
    })),
  "Choir hits": () =>
    pitched(new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 3,
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.8 },
      volume: 17,
    })),
  "Robot voice": () =>
    pitched(new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fmsquare", modulationType: "sine", harmonicity: 0.5, modulationIndex: 3 },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 },
      volume: -3,
    })),
  "Crowd cheer": () =>
    noise(new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.3, decay: 0.4, sustain: 0.6, release: 1.2 },
      volume: 9,
    })),
};

const FALLBACK_INSTRUMENT = "Piano";

/* ------------------------------------------------------------------ *
 * The engine
 * ------------------------------------------------------------------ */

type TrackAudio = {
  gain: Tone.Gain;
  instrument: string | null;
  voice: Voice | null;
  /** The last time this track played, to keep start times strictly increasing (see play). */
  lastAt: number;
};

class AudioEngine {
  #master: Tone.Gain | null = null;
  #tracks = new Map<string, TrackAudio>();
  /**
   * Volume per ticker, remembered here rather than set on a node straight
   * away. Stocks are usually added before play is pressed, and creating Tone
   * nodes before then makes Tone warn about the suspended audio context. So
   * nothing is built until play; this map holds the volumes until then.
   */
  #volumes = new Map<string, number>();

  /**
   * Builds the shared chain on first use: master -> reverb -> soft clipper.
   * Safe before the user has clicked anything: nodes can be created while the
   * audio context is still suspended, they just stay silent.
   */
  #masterBus(): Tone.Gain {
    if (!this.#master) {
      this.#master = new Tone.Gain(MASTER_GAIN);

      // A little reverb puts every instrument in the same "room", which is a
      // big part of why a mix sounds finished rather than like test tones.
      const reverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.01, wet: 0.2 });

      // Soft clipper: quiet and medium levels pass through almost unchanged,
      // so the volume sliders keep their full effect; only loud peaks are
      // smoothly rounded off below the maximum. A WaveShaper only takes input
      // from -1 to 1, so the signal is scaled down going in and the tanh
      // curve scales it back up.
      const headroom = new Tone.Gain(1 / CLIP_HEADROOM);
      const clipper = new Tone.WaveShaper((x) => Math.tanh(x * CLIP_HEADROOM), 4096);
      clipper.oversample = "4x";

      this.#master.chain(reverb, headroom, clipper, Tone.getDestination());
    }
    return this.#master;
  }

  #track(ticker: string): TrackAudio {
    let track = this.#tracks.get(ticker);
    if (!track) {
      const gain = new Tone.Gain(gainFor(this.#volumes.get(ticker) ?? 75)).connect(this.#masterBus());
      track = { gain, instrument: null, voice: null, lastAt: 0 };
      this.#tracks.set(ticker, track);
    }
    return track;
  }

  /** Browsers block audio until the user interacts, so this runs from the play button. */
  async start(): Promise<void> {
    await Tone.start();
    this.#masterBus();
  }

  /**
   * The audio clock, in seconds. It only advances while audio is running, so
   * pausing freezes it and every loop resumes from exactly where it stopped.
   */
  get time(): number {
    return Tone.getContext().currentTime;
  }

  get running(): boolean {
    return Tone.getContext().state === "running";
  }

  /** Volume slider, 0-100. */
  setTrackVolume(ticker: string, volume: number): void {
    this.#volumes.set(ticker, volume);
    // Only adjust a node that already exists; see #volumes for why.
    this.#tracks.get(ticker)?.gain.gain.rampTo(gainFor(volume), 0.03); // a ramp avoids clicks
  }

  removeTrack(ticker: string): void {
    this.#volumes.delete(ticker);
    const track = this.#tracks.get(ticker);
    if (!track) return;
    track.voice?.dispose();
    track.gain.dispose();
    this.#tracks.delete(ticker);
  }

  /** Swaps a track's instrument when the dropdown changes. */
  #voiceFor(track: TrackAudio, instrument: string): Voice {
    if (track.voice && track.instrument === instrument) return track.voice;
    track.voice?.dispose();
    const create = INSTRUMENTS[instrument] ?? INSTRUMENTS[FALLBACK_INSTRUMENT];
    track.voice = create();
    track.voice.output.connect(track.gain);
    track.instrument = instrument;
    return track.voice;
  }

  /** Play one note at `at`, a time on the audio clock (see `time`). */
  play(ticker: string, note: Note, instrument: string, at: number): void {
    if (!this.running) return;
    const track = this.#track(ticker);

    // Tone's one-note-at-a-time instruments (the basses, drums, pluck) refuse
    // two notes at exactly the same time. When the scheduler catches up after
    // a hiccup it can produce that, so nudge each note 1ms past the last.
    const time = Math.max(at, track.lastAt + 0.001);
    track.lastAt = time;

    try {
      this.#voiceFor(track, instrument).trigger(note, time);
    } catch (error) {
      // One bad note shouldn't stop the music, so it's dropped and play carries on.
      // At extreme (leveraged) tempos, Tone occasionally refuses a note that lands
      // within a hair of the previous one: expected, and not worth a warning.
      const expected = error instanceof Error && error.message.includes("strictly greater");
      if (!expected) console.warn(`Couldn't play a note for ${ticker}`, error);
    }
  }

  /** Called when transport pauses: silences everything and freezes `time`. */
  async suspend(): Promise<void> {
    const raw = Tone.getContext().rawContext as AudioContext;
    if (raw.state === "running") await raw.suspend();
  }
}

export const audio = new AudioEngine();
