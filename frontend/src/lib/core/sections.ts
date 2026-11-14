import type { KeyId, SectionId } from "$lib/core/types";

/**
 * The five fixed lanes of the mix. Colour is NOT stored here as a hex value
 * used inline: each section gets a CSS class (`lane--melody`, `card--bass`, ...)
 * and the real colours live in the stylesheets, so light and dark mode can
 * differ. This keeps the markup free of inline styles.
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
    id: 'melody',
    name: 'Melody',
    pitched: true,
    instruments: ['Saw synth', 'Piano', 'Glass bells', 'Pluck', 'Flute'],
  },
  {
    id: 'bass',
    name: 'Bass',
    pitched: true,
    instruments: ['Wobble bass', 'Sub bass', 'Slap bass', 'Upright bass'],
  },
  {
    id: 'drums',
    name: 'Drums',
    pitched: false,
    instruments: ['808 kit', 'Rock kit', 'Lo-fi kit', 'Toy box'],
  },
  {
    id: 'pads',
    name: 'Pads',
    pitched: true,
    instruments: ['Warm strings', 'Brass section', 'Choir pad', 'Space pad'],
  },
  {
    id: 'vocals',
    name: 'Vocals',
    pitched: true,
    instruments: ['Vocal chops', 'Choir hits', 'Robot voice', 'Crowd cheer'],
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
