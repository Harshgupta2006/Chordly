"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { ProgressionPresets } from "@/components/ProgressionPresets";
import { ResultsPanel } from "@/components/ResultsPanel";
import ChordlyLogo from "@/components/ChordlyLogo";
import { AudioTools } from "@/components/AudioTools";
import { PersonalizedWorkspace } from "@/components/PersonalizedWorkspace";
import { GuitarBackdrop, GuitarScrollHero, WorkspaceFooter } from "@/components/GuitarScrollScene";
import { WorkspaceHomeLink } from "@/components/WorkspaceLinks";
import { matchSongs } from "@/lib/matchingEngine";
import {
  clearWorkspaceVisit,
  isSongPath,
  jumpToWorkspaceSection,
  readWorkspaceVisit,
  rememberWorkspaceVisit,
  workspaceRestoreY,
  WorkspaceVisit,
} from "@/lib/workspaceNavigation";

// Available genres in Chordly catalogue
const GENRES = ["country", "hiphop", "pop", "rnb", "rock"];

export default function WorkspacePage() {
  // Selected chords state
  const [selectedChords, setSelectedChords] = useState<string[]>(["G", "C", "D", "Em"]);
  // Currently inspected chord for large fretboard preview
  const [previewChord, setPreviewChord] = useState<string | null>("G");
  // Mobile bottom-sheet inspector open state
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!inspectorOpen || window.matchMedia("(min-width: 1024px)").matches) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inspectorRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspectorOpen(false);
      if (event.key !== "Tab") return;
      const buttons = inspectorRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onResize = () => { if (window.innerWidth >= 1024) setInspectorOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      // Restore the control that opened the sheet after dismissal.
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [inspectorOpen]);
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
  const [resumeVisit, setResumeVisit] = useState<WorkspaceVisit | null>(null);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load localStorage after mount (guarantees zero hydration errors)
  useEffect(() => {
    const list = getStoredPracticeList();
    const startingAtTop = window.location.hash === "#chordly-workspace";
    const visit = startingAtTop ? null : readWorkspaceVisit();
    if (startingAtTop) clearWorkspaceVisit();
    setFavorites(list.favorites);
    setSelectedChords(visit?.selectedChords ?? list.learnedChords);
    setPreviewChord(visit ? visit.previewChord : list.learnedChords[0] ?? null);
    setFilters(visit?.filters ?? getStoredFilters());
    setShowOnlyFavorites(visit?.favoritesOnly ?? false);
    setResumeVisit(visit);
    setIsLoaded(true);
    if (startingAtTop) window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    if (!resumeVisit) return;
    const cancelRestore = () => setResumeVisit(null);
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    events.forEach(event => window.addEventListener(event, cancelRestore, { passive: true }));
    return () => events.forEach(event => window.removeEventListener(event, cancelRestore));
  }, [resumeVisit]);

  useEffect(() => {
    if (!resumeVisit || !isLoaded || loadingMatches || loadingRecs || (!matchResult && !apiError)) return;
    const root = document.getElementById("chordly-workspace")!;
    let firstFrame = 0, secondFrame = 0;
    const restore = () => {
      if (root.querySelector('#your-session[aria-busy="true"]')) return;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          const anchor = resumeVisit.anchor
            ? root.querySelector<HTMLAnchorElement>(`[data-workspace-link="${resumeVisit.anchor.key}"]`) : null;
          const top = workspaceRestoreY(resumeVisit, anchor?.getBoundingClientRect().top ?? null, window.scrollY);
          window.scrollTo({ top, behavior: "instant" });
          anchor?.focus({ preventScroll: true });
          setResumeVisit(null);
        });
      });
    };
    const observer = new ResizeObserver(restore);
    observer.observe(root);
    restore();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [resumeVisit, isLoaded, loadingMatches, loadingRecs, matchResult, apiError]);

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
    setPreviewChord(chords[0] ?? null);
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

  const handleInspectChord = (chord: string) => {
    setPreviewChord(chord);
    if (window.innerWidth < 1024) {
      setInspectorOpen(true);
      return;
    }
    setInspectorOpen(false);
    jumpToWorkspaceSection("chord-inspector-position", "chord-inspector");
  };

  // Toggle favorite
  const handleToggleFavorite = (songId: number) => {
    const updated = toggleFavoriteSong(songId);
    setFavorites(updated.favorites);
  };

  // Filtered results for favorites tab if active
  const displayedResults: MatchResult | null = useMemo(() => {
    if (!showOnlyFavorites) return matchResult;
    return matchSongs(selectedChords, filters, { songIds: favorites, includeAllMissing: true });
  }, [matchResult, showOnlyFavorites, favorites, selectedChords, filters]);

  function rememberSongOrigin(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || !isSongPath(url.pathname)) return;
    rememberWorkspaceVisit({
      version: 1, selectedChords, filters, favoritesOnly: showOnlyFavorites, previewChord,
      scrollY: window.scrollY,
      playableLimit: Math.max(6, document.getElementById("playable-song-results")?.children.length ?? 0),
      nearLimit: Math.max(3, document.getElementById("near-song-results")?.children.length ?? 0),
      anchor: anchor.dataset.workspaceLink ? { key: anchor.dataset.workspaceLink, top: anchor.getBoundingClientRect().top } : null,
    }, url.pathname);
  }

  return (
    <div id="chordly-workspace" className="workspace-page min-h-screen text-zinc-100 flex flex-col" onClickCapture={rememberSongOrigin}>
      <GuitarBackdrop />
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WorkspaceHomeLink className="flex items-center gap-2.5 group">
            <ChordlyLogo size={36} />
            <span className="font-black text-xl tracking-tight text-zinc-100 group-hover:text-amber-400 transition-colors">
              Chordly
            </span>
          </WorkspaceHomeLink>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Favorites toggle tab */}
          <button
            type="button"
            aria-label={`Favorites (${favorites.length})`}
            aria-pressed={showOnlyFavorites}
            onClick={() => {
              setShowOnlyFavorites(current => !current);
              jumpToWorkspaceSection("song-catalogue", "catalogue-heading");
            }}
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
            <span>Favorites ({favorites.length})</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="workspace-content min-w-0 flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
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

        <GuitarScrollHero />

        <section id="your-chords" className="chord-setup scroll-mt-24" aria-labelledby="chord-setup-heading">
          <div className="mb-6">
            <h2 id="chord-setup-heading" className="personal-heading">Your chords.</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">Tune your guitar, record a strum, or choose the chords you know to find something to play.</p>
          </div>
          <div className="chord-setup-grid">
            <div className="min-w-0">
              <AudioTools onConfirm={handleAddChord}
                recognitionEnabled={process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_AUDIO_ML === "true"} />
            </div>
            <div className="min-w-0 space-y-6">
              <ChordSelector
                selectedChords={selectedChords}
                onToggleChord={handleToggleChord}
                onClearAll={handleClearAll}
                onSelectChords={setSelectedChords}
                previewChord={previewChord}
                onPreviewChord={setPreviewChord}
                onInspectChord={(chord) => {
                  setPreviewChord(chord);
                  if (window.innerWidth < 1024) setInspectorOpen(true);
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

            <div id="chord-inspector-position" className="hidden min-w-0 self-stretch scroll-mt-20 lg:block">
              <div id="chord-inspector" role="region" aria-label={previewChord ? `${previewChord} chord shape` : "Chord inspector"} tabIndex={-1}
                className="sticky top-20 flex flex-col items-center bg-zinc-900/80 rounded-2xl border border-zinc-800 p-5 shadow-xl">
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
          </div>
        </section>

        {/* Search and Filters Bar */}
        <section id="song-catalogue" className="scroll-mt-24 space-y-6" aria-labelledby="catalogue-heading">
          <div className="flex items-center justify-between">
            <h2 id="catalogue-heading" tabIndex={-1} className="text-lg font-black text-zinc-100 tracking-tight">
              {showOnlyFavorites ? "Your favorite songs" : "Matching Songs Catalogue"}
            </h2>
            {showOnlyFavorites && (
              <button
                onClick={() => setShowOnlyFavorites(false)}
                className="text-xs text-amber-400 hover:underline"
              >
                Browse all matches
              </button>
            )}
          </div>

          <FilterBar
            filters={filters}
            onChangeFilters={setFilters}
            genres={GENRES}
          />
          <ResultsPanel
            key={JSON.stringify([isLoaded, [...selectedChords].sort(), filters, showOnlyFavorites])}
            initialPlayableLimit={resumeVisit?.playableLimit}
            initialNearLimit={resumeVisit?.nearLimit}
            favoritesView={showOnlyFavorites}
            results={displayedResults}
            loading={loadingMatches}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onSelectChordPreview={handleInspectChord}
            searchFilter={filters.q}
          />
        </section>

        <PersonalizedWorkspace
          knownChords={selectedChords}
          favorites={favorites}
          onFavorite={handleToggleFavorite}
          onAddChord={handleAddChord}
          learningRecommendations={recommendations}
          learningLoading={loadingRecs}
          onPreviewChord={handleInspectChord}
        />
      </main>
      <WorkspaceFooter />

      {/* ── Mobile Chord Inspector Bottom Sheet ── */}
      {/* Backdrop */}
      {inspectorOpen && previewChord && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setInspectorOpen(false)}
        />
      )}

      {/* Drawer panel */}
      {inspectorOpen && previewChord && <div
        ref={inspectorRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chord inspector"
        tabIndex={-1}
        className={`fixed inset-x-0 bottom-0 z-50 lg:hidden transform transition-transform duration-300 ${
          inspectorOpen && previewChord ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain bg-zinc-900 border-t border-zinc-800 rounded-t-3xl shadow-2xl px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {/* Handle bar */}
          <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-4" />

          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Chord Inspector
            </span>
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors text-sm font-bold"
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
      </div>}
    </div>
  );
}
