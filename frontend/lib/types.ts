/**
 * TypeScript domain types for Chordly.
 * Strict typing across frontend state, localStorage, and API contracts.
 * No lyrics are ever included in any type definition.
 */

export interface Chord {
  id?: number;
  name: string;
  is_barre: boolean;
  fingering: number[]; // 6 values: -1 = muted, 0 = open, >0 = fret position
}

export interface Song {
  id: number;
  title: string;
  artist: string;
  genre: string;
  difficulty: number; // 1 to 5
  capo_fret: number | null;
  chords: string[];
}

export interface NearMatch {
  song: Song;
  missing: string[];
  missing_count: number;
}

export interface MatchResult {
  playable: Song[];
  near: NearMatch[];
  total_playable: number;
  total_near: number;
}

export interface NextChordRecommendation {
  chord: string;
  unlock_count: number;
  is_barre: boolean;
  unlocked_songs: string[];
}

export interface MatchFilters {
  q?: string;
  genre?: string;
  difficulty?: number;
  difficulty_max?: number;
  max_missing?: number;
  sort?: "best" | "easiest";
}

export interface UserPracticeList {
  favorites: number[]; // List of song IDs
  learnedChords: string[]; // List of canonical chord names
}

export interface SongSheetPart {
  part: string; // e.g. "verse 1", "chorus", "bridge"
  chords: string[]; // ordered chord changes in this section
  lyrics: string; // lyrics text for this section
}

export interface SongSheet {
  song: Song;
  parts: SongSheetPart[];
}
