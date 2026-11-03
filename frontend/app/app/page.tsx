"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  getStoredFilters,
  getStoredPracticeList,
  saveLearnedChords,
  saveStoredFilters,
  toggleFavoriteSong,
} from "@/lib/localStorage";
import { MatchFilters, MatchResult, NextChordRecommendation, Song } from "@/lib/types";
import { ChordSelector } from "@/components/ChordSelector";
import { FilterBar } from "@/components/FilterBar";
import { Fretboard } from "@/components/Fretboard";
import { LearnNextPanel } from "@/components/LearnNextPanel";
import { ProgressionPresets } from "@/components/ProgressionPresets";
import { ResultsPanel } from "@/components/ResultsPanel";
import ChordlyLogo from "@/components/ChordlyLogo";

// Available genres in Chordly catalogue
const GENRES = ["country", "hiphop", "pop", "rnb", "rock"];

export default function WorkspacePage() {
  // Selected chords state
  const [selectedChords, setSelectedChords] = useState<string[]>(["G", "C", "D", "Em"]);
  // Currently inspected chord for large fretboard preview
  const [previewChord, setPreviewChord] = useState<string | null>("G");
  // Mobile bottom-sheet inspector open state
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  // Filters state
  const [filters, setFilters] = useState<MatchFilters>({
    sort: "best",
    max_missing: 2,
  });

  // Track if localStorage has been initialized
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // API Results state
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [recommendations, setRecommendations] = useState<NextChordRecommendation[]>([]);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(false);
  const [loadingRecs, setLoadingRecs] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Favorites state (safe client-side only)
  const [favorites, setFavorites] = useState<number[]>([]);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load localStorage after mount (guarantees zero hydration errors)
  useEffect(() => {
    const list = getStoredPracticeList();
    setFavorites(list.favorites);
    if (list.learnedChords && Array.isArray(list.learnedChords)) {
      setSelectedChords(list.learnedChords);
      if (list.learnedChords.length > 0) {
        setPreviewChord(list.learnedChords[0]);
      }
    }
    const storedFilters = getStoredFilters();
    setFilters(storedFilters);
    setIsLoaded(true);
  }, []);

  // Save selected chords to localStorage whenever they change after mount
  useEffect(() => {
    if (isLoaded) {
      saveLearnedChords(selectedChords);
    }
  }, [selectedChords, isLoaded]);

  // Save filters to localStorage whenever they change after mount
  useEffect(() => {
    if (isLoaded) {
      saveStoredFilters(filters);
    }
  }, [filters, isLoaded]);

  // Fetch matches whenever selected chords or filters change (debounced 300ms)
  useEffect(() => {
    if (!isLoaded) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setLoadingMatches(true);
    setLoadingRecs(true);
    setApiError(null);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        // Run match and recommendation requests in parallel
        const [matchRes, recsRes] = await Promise.all([
          api.matchSongs(selectedChords, filters),
          api.getNextChords(selectedChords, 3),
        ]);

        setMatchResult(matchRes);
        setRecommendations(recsRes.recommendations);
      } catch (err) {
        console.warn("API request failed:", err);
        setApiError(
          err instanceof Error
            ? err.message
            : "Could not load matching songs. Try again."
        );
      } finally {
        setLoadingMatches(false);
        setLoadingRecs(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [selectedChords, filters, isLoaded]);

  // Chord toggling handler
  const handleToggleChord = (chord: string) => {
    setSelectedChords((prev) => {
      if (prev.includes(chord)) {
        return prev.filter((c) => c !== chord);
      }
      return [...prev, chord];
    });
    setPreviewChord(chord);
    setInspectorOpen(true);
  };

  // Select progression preset
  const handleSelectPreset = (chords: string[]) => {
    setSelectedChords(chords);
    if (chords.length > 0) {
      setPreviewChord(chords[0]);
    }
  };

  // Clear all chords
  const handleClearAll = () => {
    setSelectedChords([]);
  };

  // Add a recommended chord
  const handleAddChord = (chord: string) => {
    if (!selectedChords.includes(chord)) {
      setSelectedChords((prev) => [...prev, chord]);
    }
    setPreviewChord(chord);
    setInspectorOpen(true);
  };

  // Toggle favorite
  const handleToggleFavorite = (songId: number) => {
    const updated = toggleFavoriteSong(songId);
    setFavorites(updated.favorites);
  };

  // Filtered results for favorites tab if active
  const displayedResults: MatchResult | null = useMemo(() => {
    if (!matchResult) return null;
    if (!showOnlyFavorites) return matchResult;

    const favSet = new Set(favorites);
    const favPlayable = matchResult.playable.filter((s) => favSet.has(s.id));
    const favNear = matchResult.near.filter((n) => favSet.has(n.song.id));

    return {
      playable: favPlayable,
      near: favNear,
      total_playable: favPlayable.length,
      total_near: favNear.length,
    };
  }, [matchResult, showOnlyFavorites, favorites]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app" className="flex items-center gap-2.5 group">
            <ChordlyLogo size={36} />
            <span className="font-black text-xl tracking-tight text-zinc-100 group-hover:text-amber-400 transition-colors">
              Chordly
            </span>
          </Link>
          <span className="hidden sm:inline-block text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">
            Discovery Workspace
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Favorites toggle tab */}
          <button
            type="button"
            onClick={() => setShowOnlyFavorites((prev) => !prev)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              showOnlyFavorites
                ? "bg-rose-500/10 text-rose-400 border-rose-500/30 ring-1 ring-rose-500/20"
                : "bg-zinc-900 text-zinc-300 hover:text-zinc-100 border-zinc-800 hover:bg-zinc-800"
            }`}
          >
            <svg
              className={`w-3.5 h-3.5 ${showOnlyFavorites ? "fill-rose-500 text-rose-500" : "fill-none stroke-current"}`}
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            <span><span className="hidden sm:inline">Favorites </span>({favorites.length})</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* API Error Alert if backend is offline */}
        {apiError && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{apiError}</span>
            </div>
            <button
              onClick={() => setSelectedChords([...selectedChords])}
              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 font-bold transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Top Split: Chord Selector & Fretboard Preview Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Chord Selection Grid (3 cols on desktop) */}
          <div className="lg:col-span-3 space-y-6">
            <ChordSelector
              selectedChords={selectedChords}
              onToggleChord={handleToggleChord}
              onClearAll={handleClearAll}
              onSelectChords={setSelectedChords}
              previewChord={previewChord}
              onPreviewChord={(chord) => {
                setPreviewChord(chord);
                if (chord) setInspectorOpen(true);
              }}
            />

            {/* Mobile hint: tap a chord to inspect */}
            <p className="lg:hidden text-xs text-zinc-500 text-center -mt-2">
              Tap any chord above to see its fingering
            </p>

            <ProgressionPresets
              onSelectPreset={handleSelectPreset}
              selectedChords={selectedChords}
            />
          </div>

          {/* Right Column: Chord Diagram Viewer — desktop only */}
          <div className="hidden lg:flex lg:col-span-1 sticky top-20 bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-zinc-800 p-5 shadow-xl flex-col items-center">
            <div className="w-full flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Chord Inspector
              </span>
              <span className="text-[10px] text-zinc-400">Tap any chord</span>
            </div>

            {previewChord ? (
              <div className="py-2 flex flex-col items-center w-full">
                <Fretboard chordName={previewChord} size="md" />
                <div className="mt-4 pt-3 border-t border-zinc-800/80 w-full flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleChord(previewChord)}
                    className={`w-full py-2 px-3 text-xs font-bold rounded-xl transition-all ${
                      selectedChords.includes(previewChord)
                        ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        : "bg-amber-500 text-zinc-950 hover:bg-amber-400 shadow-md shadow-amber-500/20"
                    }`}
                  >
                    {selectedChords.includes(previewChord) ? "Remove From My Chords" : "Add To My Chords"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-zinc-400">
                Select or hover over any chord to see string fingering
              </div>
            )}
          </div>
        </div>

        {/* Learn Next Recommendation Banner */}
        <LearnNextPanel
          recommendations={recommendations}
          onAddChord={handleAddChord}
          onPreviewChord={(chord) => {
            setPreviewChord(chord);
            if (chord) setInspectorOpen(true);
          }}
          loading={loadingRecs}
        />

        {/* Search and Filters Bar */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-zinc-100 tracking-tight">
              Matching Songs Catalogue
            </h2>
            {showOnlyFavorites && (
              <button
                onClick={() => setShowOnlyFavorites(false)}
                className="text-xs text-amber-400 hover:underline"
              >
                Clear favorites filter
              </button>
            )}
          </div>

          <FilterBar
            filters={filters}
            onChangeFilters={setFilters}
            genres={GENRES}
          />
        </div>

        {/* Results Sections: Playable & Near Matches */}
        <ResultsPanel
          results={displayedResults}
          loading={loadingMatches}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          onSelectChordPreview={setPreviewChord}
          searchFilter={filters.q}
        />
      </main>

      {/* ── Mobile Chord Inspector Bottom Sheet ── */}
      {/* Backdrop */}
      {inspectorOpen && previewChord && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setInspectorOpen(false)}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 lg:hidden transform transition-transform duration-300 ${
          inspectorOpen && previewChord ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-3xl shadow-2xl px-5 pt-4 pb-8">
          {/* Handle bar */}
          <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-4" />

          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Chord Inspector
            </span>
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors text-sm font-bold"
              aria-label="Close chord inspector"
            >
              ✕
            </button>
          </div>

          {previewChord && (
            <div className="flex flex-col items-center w-full">
              <Fretboard chordName={previewChord} size="md" />
              <div className="mt-4 pt-3 border-t border-zinc-800/80 w-full">
                <button
                  type="button"
                  onClick={() => {
                    handleToggleChord(previewChord);
                    setInspectorOpen(false);
                  }}
                  className={`w-full py-2.5 px-3 text-sm font-bold rounded-xl transition-all ${
                    selectedChords.includes(previewChord)
                      ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      : "bg-amber-500 text-zinc-950 hover:bg-amber-400 shadow-md shadow-amber-500/20"
                  }`}
                >
                  {selectedChords.includes(previewChord) ? "Remove From My Chords" : "Add To My Chords"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
