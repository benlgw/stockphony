import type { KeyId, SectionId } from "$lib/core/types";

/**
 * The fixed lanes of the mix. Each is a group of instruments AND a playing
 * style the backend generates (backend/app/music.py, STYLE):
 *   Piano, Synth  the tune: price goes up, notes go up
 *   Guitar        picks through chord notes, one per step
 *   Bass          a smoothed bass line
 *   Drums         kick on the beat, hats on busy weeks
 *   Chords        one long chord per bar, underneath everything
 *   Volatility    silent until the price jumps sharply
 *
 * Colour is NOT stored here: each section gets a CSS class (`lane--piano`,
 * ...) and the colours live in app.css, so light and dark mode can differ.
 * The first instrument in each list is the one a new stock starts with.
 */
export type SectionDef = {
  id: SectionId;
  name: string;
  /** Drums have no pitch, so their key picker is disabled. */
  pitched: boolean;
  instruments: string[];
};

export const SECTIONS: SectionDef[] = [
  {
    id: 'piano',
    name: 'Piano',
    pitched: true,
    instruments: ['Grand piano', 'Electric piano', 'Organ'],
  },
  {
    id: 'guitar',
    name: 'Guitar',
    pitched: true,
    instruments: ['Acoustic guitar', 'Electric guitar', 'Nylon guitar'],
  },
  {
    id: 'synth',
    name: 'Synth',
    pitched: true,
    instruments: ['Saw synth', 'Pluck', 'Flute', 'Glass bells', 'Xylophone'],
  },
  {
    id: 'bass',
    name: 'Bass',
    pitched: true,
    instruments: ['Wobble bass', 'Sub bass', 'Slap bass', 'Upright bass', 'Electric bass'],
  },
  {
    id: 'drums',
    name: 'Drums',
    pitched: false,
    instruments: ['808 kit', 'Rock kit', 'Lo-fi kit', 'Toy box'],
  },
  {
    id: 'chords',
    name: 'Chords',
    pitched: true,
    instruments: ['Warm strings', 'Cello', 'Choir pad', 'Space pad', 'Brass section'],
  },
  {
    id: 'volatility',
    name: 'Volatility',
    pitched: true,
    instruments: ['Trumpet', 'Saxophone', 'Vocal chops', 'Choir hits', 'Robot voice', 'Crowd cheer'],
  },
];

export const KEYS: { id: KeyId; label: string }[] = [
  { id: 'cmaj', label: 'C major' },
  { id: 'amin', label: 'A minor' },
  { id: 'ddor', label: 'D dorian' },
  { id: 'ephr', label: 'E phrygian' },
];

export function sectionById(id: SectionId): SectionDef {
  const found = SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown section: ${id}`);
  return found;
}
