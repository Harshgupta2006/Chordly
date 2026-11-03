/**
 * Typed API client for Chordly.
 * Uses the bundled matching engine so the Vercel frontend works without a FastAPI host.
 * If NEXT_PUBLIC_API_URL points at a non-local backend, that remote API is used instead.
 * Never stores or requests lyrics.
 */

import {
  getAllChords,
  getAllSongs,
  getNextChords as matchNextChords,
  getSongById,
  getSongSheet as localGetSongSheet,
  matchSongs as localMatchSongs,
} from "./matchingEngine";
import { Chord, MatchFilters, MatchResult, NextChordRecommendation, Song, SongSheet } from "./types";

const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || "";
const USE_REMOTE =
  Boolean(configuredUrl) &&
  !configuredUrl.includes("localhost") &&
  !configuredUrl.includes("127.0.0.1");
const BASE_URL = configuredUrl;

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
  async health(): Promise<{ status: string }> {
    if (!USE_REMOTE) {
      return { status: "ok" };
    }
    return request<{ status: string }>("/health");
  },

  async getChords(): Promise<Chord[]> {
    if (!USE_REMOTE) {
      return getAllChords();
    }
    return request<Chord[]>("/chords");
  },

  async getSongs(params: {
    q?: string;
    genre?: string;
    difficulty_min?: number;
    difficulty_max?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: Song[]; total: number; limit: number; offset: number }> {
    if (!USE_REMOTE) {
      const limit = Math.min(params.limit ?? 20, 100);
      const offset = params.offset ?? 0;
      const page = Math.floor(offset / limit) + 1;
      const result = getAllSongs({
        page,
        limit,
        genre: params.genre,
        difficulty: params.difficulty_min,
        q: params.q,
      });
      return {
        items: result.items,
        total: result.total,
        limit: result.limit,
        offset,
      };
    }

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

  async matchSongs(
    knownChords: string[],
    filters: MatchFilters = {}
  ): Promise<MatchResult> {
    if (!USE_REMOTE) {
      return localMatchSongs(knownChords, filters);
    }
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

  async getNextChords(
    knownChords: string[],
    limit: number = 3
  ): Promise<{ recommendations: NextChordRecommendation[] }> {
    if (!USE_REMOTE) {
      return matchNextChords(knownChords, limit);
    }
    return request<{ recommendations: NextChordRecommendation[] }>("/next-chords", {
      method: "POST",
      body: JSON.stringify({
        known_chords: knownChords,
        limit,
      }),
    });
  },

  async getSong(id: number): Promise<Song> {
    if (!USE_REMOTE) {
      const song = getSongById(id);
      if (!song) {
        throw new ApiError("Song not found", 404);
      }
      return song;
    }
    return request<Song>(`/songs/${id}`);
  },

  async getSongSheet(id: number): Promise<SongSheet> {
    if (!USE_REMOTE) {
      const sheet = localGetSongSheet(id);
      if (!sheet) {
        throw new ApiError("Song not found", 404);
      }
      return sheet;
    }
    return request<SongSheet>(`/songs/${id}/sheet`);
  },
};
