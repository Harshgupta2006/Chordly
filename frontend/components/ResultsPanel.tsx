"use client";

import React, { useEffect, useRef, useState } from "react";
import { MatchResult, Song } from "../lib/types";
import { SongCard } from "./SongCard";

interface ResultsPanelProps {
  results: MatchResult | null;
  loading: boolean;
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onSelectChordPreview: (chordName: string) => void;
  searchFilter?: string;
  initialPlayableLimit?: number;
  initialNearLimit?: number;
  favoritesView?: boolean;
}

export function ResultsPanel({
  results,
  loading,
  favorites,
  onToggleFavorite,
  onSelectChordPreview,
  searchFilter = "",
  initialPlayableLimit = 6,
  initialNearLimit = 3,
  favoritesView = false,
}: ResultsPanelProps) {
  const favSet = new Set(favorites);
  const [playableLimit, setPlayableLimit] = useState(initialPlayableLimit);
  const [nearLimit, setNearLimit] = useState(initialNearLimit);
  const [announcement, setAnnouncement] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const focusSong = useRef<number | null>(null);

  useEffect(() => {
    if (focusSong.current === null) return;
    panel.current?.querySelector<HTMLAnchorElement>(`a[href="/app/song/${focusSong.current}"]`)?.focus();
    focusSong.current = null;
  }, [playableLimit, nearLimit]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div>
          <div className="h-6 bg-zinc-800 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 bg-zinc-900/60 rounded-2xl border border-zinc-800"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="text-center py-16 bg-zinc-900/40 rounded-3xl border border-dashed border-zinc-800 p-8">
        <div className="inline-flex p-3 rounded-2xl bg-zinc-800 text-zinc-400 mb-3">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-zinc-200">Select chords to discover songs</h3>
        <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
          Tap the chords you already know above or click a preset to see songs you can start playing today.
        </p>
      </div>
    );
  }

  // Apply optional client search filter for instant responsiveness
  const filterSong = (s: Song) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return s.title.toLowerCase().includes(term) || s.artist.toLowerCase().includes(term);
  };

  const filteredPlayable = results.playable.filter(filterSong);
  const filteredNear = results.near.filter((item) => filterSong(item.song));

  const totalFiltered = filteredPlayable.length + filteredNear.length;

  if (totalFiltered === 0) {
    return (
      <div className="text-center py-16 bg-zinc-900/40 rounded-3xl border border-dashed border-zinc-800 p-8">
        <h3 className="text-base font-bold text-zinc-200">
          {favoritesView ? favorites.length ? "No favorites match these filters" : "No favorites yet" : "No songs match your selection"}
        </h3>
        <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
          {favoritesView ? favorites.length ? "Clear your search or adjust the genre and difficulty filters." : "Save a song using its favorite button to find it here."
            : "Try selecting additional chords from the grid, clearing search filters, or increasing the difficulty threshold."}
        </p>
      </div>
    );
  }

  return (
    <div ref={panel} className="space-y-10">
      <p role="status" className="sr-only">{announcement}</p>
      {/* 1. Playable Songs Section */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex h-3 w-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
          <h2 className="text-lg font-black text-zinc-100 tracking-tight">
            {favoritesView ? "Favorites you can play now" : "You Can Play These Now"}
          </h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {filteredPlayable.length} {filteredPlayable.length === 1 ? "song" : "songs"}
          </span>
        </div>

        {filteredPlayable.length > 0 ? (
          <div id="playable-song-results" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlayable.slice(0, playableLimit).map((song) => (
              <SongCard
                key={`playable-${song.id}`}
                song={song}
                isFavorite={favSet.has(song.id)}
                onToggleFavorite={onToggleFavorite}
                onSelectChordPreview={onSelectChordPreview}
              />
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 text-center">
            <p className="text-xs text-zinc-400">
              No songs in the catalog are 100% playable with only these chords yet. Check the near matches below!
            </p>
          </div>
        )}
        {filteredPlayable.length > playableLimit && (
          <button type="button" className="catalogue-more" aria-controls="playable-song-results"
            onClick={() => {
              const nextLimit = Math.min(playableLimit + 6, filteredPlayable.length);
              if (nextLimit === filteredPlayable.length) focusSong.current = filteredPlayable[playableLimit].id;
              setPlayableLimit(nextLimit);
              setAnnouncement(`${nextLimit} of ${filteredPlayable.length} playable songs shown.`);
            }}>
            Show more playable songs <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>

      {/* 2. Near Matches Section */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex h-3 w-3 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
          <h2 className="text-lg font-black text-zinc-100 tracking-tight">
            {favoritesView ? "Saved songs with chords to learn" : "Almost There (1 or 2 Chords Away)"}
          </h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {filteredNear.length} {filteredNear.length === 1 ? "song" : "songs"}
          </span>
        </div>

        {filteredNear.length > 0 ? (
          <div id="near-song-results" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNear.slice(0, nearLimit).map((item) => (
              <SongCard
                key={`near-${item.song.id}`}
                song={item.song}
                missingChords={item.missing}
                isFavorite={favSet.has(item.song.id)}
                onToggleFavorite={onToggleFavorite}
                onSelectChordPreview={onSelectChordPreview}
              />
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 text-center">
            <p className="text-xs text-zinc-400">No near matches found.</p>
          </div>
        )}
        {filteredNear.length > nearLimit && (
          <button type="button" className="catalogue-more" aria-controls="near-song-results"
            onClick={() => {
              const nextLimit = Math.min(nearLimit + 3, filteredNear.length);
              if (nextLimit === filteredNear.length) focusSong.current = filteredNear[nearLimit].song.id;
              setNearLimit(nextLimit);
              setAnnouncement(`${nextLimit} of ${filteredNear.length} near matches shown.`);
            }}>
            Show more near matches <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>
    </div>
  );
}
