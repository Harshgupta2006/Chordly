"use client";

import React from "react";
import { MatchFilters } from "../lib/types";

interface FilterBarProps {
  filters: MatchFilters;
  onChangeFilters: (newFilters: MatchFilters) => void;
  genres: string[];
}

export function FilterBar({ filters, onChangeFilters, genres }: FilterBarProps) {
  return (
    <div className="bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-zinc-800/80 p-4 shadow-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
        {/* Search input */}
        <div className="relative lg:col-span-2">
          <input
            type="text"
            value={filters.q || ""}
            onChange={(e) => onChangeFilters({ ...filters, q: e.target.value })}
            placeholder="Search song title or artist..."
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-zinc-800/80 border border-zinc-700/60 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
          />
          <svg
            className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </div>

        {/* Genre Selector */}
        <div>
          <select
            value={filters.genre || ""}
            onChange={(e) => onChangeFilters({ ...filters, genre: e.target.value || undefined })}
            className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-800/80 border border-zinc-700/60 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
            aria-label="Filter by genre"
          >
            <option value="">All Genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Difficulty Selector */}
        <div>
          <select
            value={filters.difficulty !== undefined ? String(filters.difficulty) : ""}
            onChange={(e) =>
              onChangeFilters({
                ...filters,
                difficulty: e.target.value ? Number(e.target.value) : undefined,
                difficulty_max: undefined,
              })
            }
            className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-800/80 border border-zinc-700/60 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
            aria-label="Filter by difficulty"
          >
            <option value="">Any Difficulty</option>
            <option value="1">Level 1 (Beginner)</option>
            <option value="2">Level 2 (Easy)</option>
            <option value="3">Level 3 (Intermediate)</option>
            <option value="4">Level 4 (Advanced)</option>
            <option value="5">Level 5 (Expert)</option>
          </select>
        </div>

        {/* Sort Toggle */}
        <div>
          <select
            value={filters.sort || "best"}
            onChange={(e) =>
              onChangeFilters({
                ...filters,
                sort: (e.target.value as "best" | "easiest") || "best",
              })
            }
            className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-800/80 border border-zinc-700/60 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
            aria-label="Sort order"
          >
            <option value="best">Sort: Best Match</option>
            <option value="easiest">Sort: Easiest First</option>
          </select>
        </div>
      </div>
    </div>
  );
}
