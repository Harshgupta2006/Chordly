/**
 * Safe client-side storage utilities.
 *
 * Rules:
 * - Runs only in browser environment after component mount to eliminate hydration mismatches.
 * - Parses JSON inside try/catch blocks.
 * - Validates chord tokens against CANONICAL_CHORDS_SET to purge corrupt data.
 */

import { CANONICAL_CHORDS_SET } from "./chords";
import { MatchFilters, UserPracticeList } from "./types";

const PRACTICE_LIST_KEY = "chordly_practice_list_v1";
const FILTERS_KEY = "chordly_filters_v1";

const DEFAULT_FILTERS: MatchFilters = {
  sort: "best",
  max_missing: 2,
};

const DEFAULT_PRACTICE_LIST: UserPracticeList = {
  favorites: [],
  learnedChords: ["G", "C", "D", "Em"],
};

export function getStoredPracticeList(): UserPracticeList {
  if (typeof window === "undefined") {
    return DEFAULT_PRACTICE_LIST;
  }

  try {
    const raw = localStorage.getItem(PRACTICE_LIST_KEY);
    if (!raw) {
      return DEFAULT_PRACTICE_LIST;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_PRACTICE_LIST;
    }

    // Sanitize favorites (must be list of positive numbers)
    const favorites = Array.isArray(parsed.favorites)
      ? parsed.favorites.filter((id: unknown): id is number => typeof id === "number" && id > 0)
      : [];

    // Sanitize learnedChords (must be valid canonical chord strings)
    const learnedChords = Array.isArray(parsed.learnedChords)
      ? parsed.learnedChords.filter(
          (c: unknown): c is string => typeof c === "string" && CANONICAL_CHORDS_SET.has(c)
        )
      : DEFAULT_PRACTICE_LIST.learnedChords;

    return { favorites, learnedChords };
  } catch (error) {
    console.warn("Failed to parse localStorage practice list. Resetting to default.", error);
    return DEFAULT_PRACTICE_LIST;
  }
}

export function saveStoredPracticeList(data: UserPracticeList): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(PRACTICE_LIST_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Failed to save practice list to localStorage.", error);
  }
}

export function saveLearnedChords(chords: string[]): UserPracticeList {
  const current = getStoredPracticeList();
  const updated: UserPracticeList = {
    ...current,
    learnedChords: chords,
  };
  saveStoredPracticeList(updated);
  return updated;
}

export function toggleFavoriteSong(songId: number): UserPracticeList {
  const current = getStoredPracticeList();
  const exists = current.favorites.includes(songId);
  const updatedFavorites = exists
    ? current.favorites.filter((id) => id !== songId)
    : [...current.favorites, songId];

  const updated: UserPracticeList = {
    ...current,
    favorites: updatedFavorites,
  };
  saveStoredPracticeList(updated);
  return updated;
}

export function getStoredFilters(): MatchFilters {
  if (typeof window === "undefined") {
    return DEFAULT_FILTERS;
  }

  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) {
      return DEFAULT_FILTERS;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_FILTERS;
    }

    return {
      q: typeof parsed.q === "string" ? parsed.q : undefined,
      genre: typeof parsed.genre === "string" ? parsed.genre : undefined,
      difficulty: typeof parsed.difficulty === "number" ? parsed.difficulty : undefined,
      difficulty_max: typeof parsed.difficulty_max === "number" ? parsed.difficulty_max : undefined,
      max_missing: typeof parsed.max_missing === "number" ? parsed.max_missing : 2,
      sort: parsed.sort === "easiest" ? "easiest" : "best",
    };
  } catch (error) {
    console.warn("Failed to parse localStorage filters.", error);
    return DEFAULT_FILTERS;
  }
}

export function saveStoredFilters(filters: MatchFilters): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch (error) {
    console.warn("Failed to save filters to localStorage.", error);
  }
}
