/**
 * Frontend chord catalog and grouping definitions.
 * Mirrors backend canonical chord definitions in backend/app/chords.py.
 */

export const QUICK_PICK_CHORDS = [
  "G", "C", "D", "Em", "Am", "E", "A", "Dm"
] as const;

export interface ChordGroup {
  id: string;
  label: string;
  chords: string[];
}

export const CHORD_GROUPS: ChordGroup[] = [
  {
    id: "open-majors",
    label: "Open Majors",
    chords: ["C", "D", "E", "G", "A"],
  },
  {
    id: "open-minors",
    label: "Open Minors",
    chords: ["Am", "Dm", "Em"],
  },
  {
    id: "seventh-chords",
    label: "7th & Major 7th",
    chords: [
      "A7", "B7", "C7", "D7", "E7", "G7",
      "Am7", "Dm7", "Em7", "Bm7",
      "Cmaj7", "Fmaj7", "Gmaj7", "Amaj7", "Dmaj7",
    ],
  },
  {
    id: "suspended-add",
    label: "Suspended & Add9",
    chords: ["Dsus2", "Dsus4", "Asus2", "Asus4", "Esus4", "Gsus4", "Cadd9"],
  },
  {
    id: "barre-chords",
    label: "Barre Chords",
    chords: [
      "F", "B", "Bm", "Cm", "Fm", "Gm",
      "F#m", "C#m", "G#m", "F#", "C#", "G#",
      "D#", "A#", "A#m", "F7", "F#7",
    ],
  },
];

export interface ProgressionPreset {
  id: string;
  name: string;
  description: string;
  chords: string[];
}

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  {
    id: "four-chords-pop",
    name: "C - G - Am - F",
    description: "The famous 4-chord progression used in hundreds of pop hits.",
    chords: ["C", "G", "Am", "F"],
  },
  {
    id: "classic-folk",
    name: "G - C - D - Em",
    description: "The foundational campfire folk and acoustic rock progression.",
    chords: ["G", "C", "D", "Em"],
  },
  {
    id: "doo-wop",
    name: "C - Am - F - G",
    description: "The timeless 50s ballad and soul progression.",
    chords: ["C", "Am", "F", "G"],
  },
  {
    id: "acoustic-ballad",
    name: "Am - C - G - D",
    description: "Moody, melancholic acoustic progression.",
    chords: ["Am", "C", "G", "D"],
  },
  {
    id: "blues-roots",
    name: "E7 - A7 - B7",
    description: "Classic 12-bar delta blues chord trio.",
    chords: ["E7", "A7", "B7"],
  },
];

export const CANONICAL_CHORDS_SET: ReadonlySet<string> = new Set(
  CHORD_GROUPS.flatMap((group) => group.chords)
);
