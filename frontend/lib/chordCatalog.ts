import { Chord } from "./types";
import chordsJson from "../data/chords.json";

export const STATIC_CHORDS: Chord[] = chordsJson as Chord[];

export const STATIC_CHORDS_MAP: Map<string, Chord> = new Map(
  STATIC_CHORDS.map((c) => [c.name, c])
);

export function getChordFingering(chordName: string): Chord | undefined {
  return STATIC_CHORDS_MAP.get(chordName);
}
