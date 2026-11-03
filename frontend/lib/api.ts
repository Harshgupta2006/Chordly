/**
 * Typed API client for Chordly.
 * Single source of truth for all network requests from frontend to FastAPI backend.
 * Never stores or requests lyrics.
 */

import { Chord, MatchFilters, MatchResult, NextChordRecommendation, Song, SongSheet } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = typeof errorData.detail === "string" ? errorData.detail : JSON.stringify(errorData.detail);
        }
      } catch {
        // Fallback to response status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new ApiError(errorMessage, response.status);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : "Network error. Is the backend server running?",
      0
    );
  }
}

export const api = {
  /**
   * Health check probe.
   */
  async health(): Promise<{ status: string }> {
    return request<{ status: string }>("/health");
  },

  /**
   * Fetch all guitar chords with fingering arrays.
   */
  async getChords(): Promise<Chord[]> {
    return request<Chord[]>("/chords");
  },

  /**
   * Fetch songs catalog with search and filtering.
   */
  async getSongs(params: {
    q?: string;
    genre?: string;
    difficulty_min?: number;
    difficulty_max?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: Song[]; total: number; limit: number; offset: number }> {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.genre) query.set("genre", params.genre);
    if (params.difficulty_min !== undefined) query.set("difficulty_min", String(params.difficulty_min));
    if (params.difficulty_max !== undefined) query.set("difficulty_max", String(params.difficulty_max));
    if (params.limit !== undefined) query.set("limit", String(Math.min(params.limit, 100)));
    if (params.offset !== undefined) query.set("offset", String(params.offset));

    const queryString = query.toString();
    return request(`/songs${queryString ? `?${queryString}` : ""}`);
  },

  /**
   * Match songs against selected known chords.
   */
  async matchSongs(
    knownChords: string[],
    filters: MatchFilters = {}
  ): Promise<MatchResult> {
    return request<MatchResult>("/match", {
      method: "POST",
      body: JSON.stringify({
        known_chords: knownChords,
        genre: filters.genre || undefined,
        difficulty: filters.difficulty || undefined,
        difficulty_max: filters.difficulty_max || undefined,
        max_missing: filters.max_missing ?? 2,
        sort: filters.sort || "best",
      }),
    });
  },

  /**
   * Recommend next chords to learn.
   */
  async getNextChords(
    knownChords: string[],
    limit: number = 3
  ): Promise<{ recommendations: NextChordRecommendation[] }> {
    return request<{ recommendations: NextChordRecommendation[] }>("/next-chords", {
      method: "POST",
      body: JSON.stringify({
        known_chords: knownChords,
        limit,
      }),
    });
  },

  /**
   * Fetch a single song by ID.
   */
  async getSong(id: number): Promise<Song> {
    return request<Song>(`/songs/${id}`);
  },

  /**
   * Fetch full chord+lyrics sheet for a song.
   */
  async getSongSheet(id: number): Promise<SongSheet> {
    return request<SongSheet>(`/songs/${id}/sheet`);
  },
};
