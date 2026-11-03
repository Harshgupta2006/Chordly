import chordsData from "../data/chords.json";
import songsData from "../data/songs.json";
import sheetsData from "../data/sheets.json";
import {
  Chord,
  MatchFilters,
  MatchResult,
  NearMatch,
  NextChordRecommendation,
  Song,
  SongSheet,
  SongSheetPart,
} from "./types";

const CHORDS: Chord[] = chordsData as Chord[];
const SONGS: Song[] = songsData as Song[];
const SHEETS: Record<string, SongSheetPart[]> = sheetsData as Record<string, SongSheetPart[]>;

const BARRE_CHORD_NAMES = new Set(
  CHORDS.filter((c) => c.is_barre).map((c) => c.name)
);

export function isBarre(chordName: string): boolean {
  return BARRE_CHORD_NAMES.has(chordName);
}

export function getAllChords(): Chord[] {
  return CHORDS;
}

export function getSongById(id: number): Song | null {
  return SONGS.find((s) => s.id === id) || null;
}

export function getSongSheet(id: number): SongSheet | null {
  const song = getSongById(id);
  if (!song) return null;
  const parts = SHEETS[String(id)] || [];
  return { song, parts };
}

export function getAllSongs(options: {
  page?: number;
  limit?: number;
  genre?: string;
  difficulty?: number;
  q?: string;
}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));

  let filtered = SONGS;

  if (options.genre) {
    const genreLower = options.genre.toLowerCase();
    filtered = filtered.filter((s) => s.genre.toLowerCase() === genreLower);
  }

  if (options.difficulty !== undefined) {
    filtered = filtered.filter((s) => s.difficulty === options.difficulty);
  }

  if (options.q && options.q.trim()) {
    const term = options.q.trim().toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(term) ||
        s.artist.toLowerCase().includes(term)
    );
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return {
    items,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
  };
}

export function matchSongs(
  knownChords: string[],
  filters: MatchFilters = {}
): MatchResult {
  const knownSet = new Set(knownChords);

  let pool = SONGS;

  if (filters.genre && filters.genre.trim()) {
    const genreLower = filters.genre.trim().toLowerCase();
    pool = pool.filter((s) => s.genre.toLowerCase() === genreLower);
  }

  if (filters.difficulty !== undefined) {
    pool = pool.filter((s) => s.difficulty === filters.difficulty);
  } else if (filters.difficulty_max !== undefined) {
    pool = pool.filter((s) => s.difficulty <= filters.difficulty_max!);
  }

  if (filters.q && filters.q.trim()) {
    const term = filters.q.trim().toLowerCase();
    pool = pool.filter(
      (s) =>
        s.title.toLowerCase().includes(term) ||
        s.artist.toLowerCase().includes(term)
    );
  }

  const playable: Song[] = [];
  const near: NearMatch[] = [];

  for (const song of pool) {
    const missing = song.chords.filter((c) => !knownSet.has(c));
    const count = missing.length;

    if (count === 0) {
      playable.push(song);
    } else if (count === 1 || count === 2) {
      const maxMissingAllowed = filters.max_missing ?? 2;
      if (count <= maxMissingAllowed) {
        near.push({ song, missing, missing_count: count });
      }
    }
  }

  // Sorting
  if (filters.sort === "easiest") {
    playable.sort((a, b) => {
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      if (a.chords.length !== b.chords.length) return a.chords.length - b.chords.length;
      return a.title.localeCompare(b.title);
    });

    near.sort((a, b) => {
      if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
      if (a.song.difficulty !== b.song.difficulty) return a.song.difficulty - b.song.difficulty;
      if (a.song.chords.length !== b.song.chords.length) return a.song.chords.length - b.song.chords.length;
      return a.song.title.localeCompare(b.song.title);
    });
  } else {
    // "best" (default)
    playable.sort((a, b) => {
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      if (a.chords.length !== b.chords.length) return a.chords.length - b.chords.length;
      return a.title.localeCompare(b.title);
    });

    near.sort((a, b) => {
      if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
      if (a.song.difficulty !== b.song.difficulty) return a.song.difficulty - b.song.difficulty;
      if (a.song.chords.length !== b.song.chords.length) return a.song.chords.length - b.song.chords.length;
      return a.song.title.localeCompare(b.song.title);
    });
  }

  return {
    playable,
    near,
    total_playable: playable.length,
    total_near: near.length,
  };
}

export function getNextChords(
  knownChords: string[],
  limit: number = 3
): { recommendations: NextChordRecommendation[]; input_chords: string[] } {
  const knownSet = new Set(knownChords);

  const unlockMap: Record<string, string[]> = {};
  const candidatePool = new Set<string>();

  for (const song of SONGS) {
    for (const c of song.chords) {
      candidatePool.add(c);
    }

    const missing = song.chords.filter((c) => !knownSet.has(c));
    if (missing.length === 1) {
      const missingChord = missing[0];
      if (!unlockMap[missingChord]) {
        unlockMap[missingChord] = [];
      }
      unlockMap[missingChord].push(song.title);
    }
  }

  const unknownCandidates = Array.from(candidatePool).filter((c) => !knownSet.has(c));

  const ranked: NextChordRecommendation[] = unknownCandidates.map((chord) => {
    const unlocked = unlockMap[chord] || [];
    return {
      chord,
      unlock_count: unlocked.length,
      is_barre: isBarre(chord),
      unlocked_songs: unlocked,
    };
  });

  ranked.sort((a, b) => {
    if (b.unlock_count !== a.unlock_count) return b.unlock_count - a.unlock_count;
    if (a.is_barre !== b.is_barre) return a.is_barre ? 1 : -1; // non-barre first
    return a.chord.localeCompare(b.chord);
  });

  return {
    recommendations: ranked.slice(0, limit),
    input_chords: knownChords,
  };
}

