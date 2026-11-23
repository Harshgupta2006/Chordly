"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getAllChords, getAllSongs, getSongById } from "@/lib/matchingEngine";
import {
  personalizedNextChord,
  rankPersonalizedSongs,
  selectDiscoverySongs,
} from "@/lib/personalization";
import {
  dismissRecommendation,
  GENRE_LABELS,
  localDay,
  MUSIC_GENRES,
  removePractice,
  resetPersonalization,
  savePreferences,
} from "@/lib/personalizationStorage";
import { NextChordRecommendation, PersonalPreferences, PersonalizedSong } from "@/lib/types";
import { usePersonalization } from "@/lib/usePersonalization";
import { PracticeButton } from "./PracticeButton";
import { LearnNextPanel } from "./LearnNextPanel";

const cataloguePage = getAllSongs({ limit: 100 });
const CATALOGUE = Array.from({ length: cataloguePage.total_pages }, (_, index) =>
  getAllSongs({ page: index + 1, limit: 100 }).items
).flat();
const BARRE_CHORDS = new Set(
  getAllChords().filter(chord => chord.is_barre).map(chord => chord.name)
);
const LEVELS = ["Beginner", "Easy", "Intermediate", "Advanced", "Expert"];

interface PreferencesEditorProps {
  preferences: PersonalPreferences;
  onClose: () => void;
}

function PreferencesEditor({ preferences, onClose }: PreferencesEditorProps) {
  const [draft, setDraft] = useState(preferences);

  function toggleGenre(genre: string) {
    setDraft(current => ({
      ...current,
      genres: current.genres.includes(genre)
        ? current.genres.filter(value => value !== genre)
        : [...current.genres, genre],
    }));
  }

  return (
    <form
      className="personal-preferences"
      onSubmit={event => {
        event.preventDefault();
        savePreferences(draft);
        onClose();
      }}
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
          Your music preferences
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">
          Pick what you enjoy. Your favourites and practice will shape the next suggestions.
        </p>
      </div>
      <fieldset>
        <legend className="personal-label">Genres you enjoy</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {MUSIC_GENRES.map(genre => (
            <button
              type="button"
              key={genre}
              className="personal-choice"
              aria-pressed={draft.genres.includes(genre)}
              onClick={() => toggleGenre(genre)}
            >
              {GENRE_LABELS[genre]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="personal-label">
          Practice up to
          <select
            value={draft.maxDifficulty}
            onChange={event => setDraft({ ...draft, maxDifficulty: Number(event.target.value) })}
            className="personal-select mt-2"
          >
            {LEVELS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </select>
        </label>
        <label className="personal-label">
          Your focus
          <select
            value={draft.goal}
            onChange={event => setDraft({
              ...draft,
              goal: event.target.value as PersonalPreferences["goal"],
            })}
            className="personal-select mt-2"
          >
            <option value="play">Play songs with familiar chords</option>
            <option value="learn">Explore new chord shapes</option>
          </select>
        </label>
      </div>
      <button className="personal-primary sm:justify-self-start" type="submit">Save my preferences</button>
    </form>
  );
}

interface RecommendationRowProps {
  item: PersonalizedSong;
  favorite: boolean;
  onFavorite: (id: number) => void;
  featured?: boolean;
}

function RecommendationRow({ item, favorite, onFavorite, featured = false }: RecommendationRowProps) {
  return (
    <article className={featured ? "personal-song personal-song-featured" : "personal-song"}>
      <div className="min-w-0 flex-1">
        <p className="personal-song-meta">
          {GENRE_LABELS[item.song.genre] || item.song.genre} · {LEVELS[item.song.difficulty - 1]}
        </p>
        <Link href={`/app/song/${item.song.id}`} data-workspace-link={`recommendation-${item.song.id}`} className="personal-song-title">
          {item.song.title}
        </Link>
        <p className="mt-1 text-sm text-zinc-400">{item.song.artist}</p>
        <p className="personal-reason">{item.reasons.join(" · ")}</p>
        <div className="personal-song-actions mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link className="personal-sheet-link" data-workspace-link={`sheet-${item.song.id}`} href={`/app/song/${item.song.id}`}>
            Open song sheet <span aria-hidden="true">↗</span>
          </Link>
          <PracticeButton songId={item.song.id} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          className="personal-icon-button"
          type="button"
          aria-label={`${favorite ? "Unsave" : "Save"} ${item.song.title}`}
          aria-pressed={favorite}
          onClick={() => onFavorite(item.song.id)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="m6 3 12 0v18l-6-4-6 4V3Z" />
          </svg>
        </button>
        <button
          className="personal-icon-button text-zinc-500"
          type="button"
          aria-label={`Hide ${item.song.title} from recommendations`}
          onClick={() => dismissRecommendation(item.song.id)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="m6 6 12 12M6 18 18 6" />
          </svg>
        </button>
      </div>
    </article>
  );
}

interface PersonalizedWorkspaceProps {
  knownChords: string[];
  favorites: number[];
  onFavorite: (id: number) => void;
  onAddChord: (chord: string) => void;
  learningRecommendations: NextChordRecommendation[];
  learningLoading: boolean;
  onPreviewChord: (chord: string) => void;
}

export function PersonalizedWorkspace({
  knownChords, favorites, onFavorite, onAddChord, learningRecommendations, learningLoading, onPreviewChord,
}: PersonalizedWorkspaceProps) {
  const { profile, loaded, persistent } = usePersonalization();
  const [editing, setEditing] = useState(true);
  const [practiceNotice, setPracticeNotice] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const now = Date.now();
  const preferencesOpen = editing || !profile.onboarded;
  const ranked = useMemo(
    () => rankPersonalizedSongs({ songs: CATALOGUE, profile, knownChords, favorites }),
    [profile, knownChords, favorites]
  );
  const suggestions = useMemo(() => selectDiscoverySongs(ranked), [ranked]);
  const nextChord = useMemo(() => {
    const candidates = rankPersonalizedSongs({ songs: CATALOGUE, profile, knownChords, favorites }, true);
    return personalizedNextChord(candidates, BARRE_CHORDS);
  }, [profile, knownChords, favorites]);
  const otherLearning = learningRecommendations.filter(item => item.chord !== nextChord?.chord);
  const recent = [...new Map([...profile.history].reverse().map(entry => [entry.songId, entry])).values()]
    .sort((a, b) => Date.parse(b.practicedAt) - Date.parse(a.practicedAt))
    .map(entry => ({ ...entry, song: getSongById(entry.songId) }))
    .filter(entry => entry.song)
    .slice(0, 4);

  if (!loaded) {
    return (
      <section id="your-session" className="personal-shell" aria-label="Loading personalized songs" aria-busy="true">
        <div className="personal-loading animate-pulse" />
      </section>
    );
  }

  return (
    <>
      <section id="your-session" className="personal-workspace" aria-labelledby="personal-heading">
        <div className="personal-heading-row">
          <div>
            <h2 id="personal-heading" className="personal-heading">Your next session.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
              Songs shaped by your chords, favourites and practice.
            </p>
          </div>
          <button
            type="button"
            className="personal-preference-toggle"
            aria-expanded={preferencesOpen}
            aria-controls="personal-preferences"
            onClick={() => {
              setEditing(current => !current);
              setConfirmReset(false);
            }}
          >
            {preferencesOpen ? "Hide preferences" : "Show preferences"} <span aria-hidden="true">↗</span>
          </button>
        </div>
        {preferencesOpen && (
          <div className="personal-shell" id="personal-preferences">
            <PreferencesEditor
              key={`${JSON.stringify(profile.preferences)}:${resetVersion}`}
              preferences={profile.preferences}
              onClose={() => setEditing(false)}
            />
          </div>
        )}
        {!persistent && (
          <p role="status" className="text-sm text-amber-300">
            Browser storage is unavailable. Your preferences and practice are kept for this tab session.
          </p>
        )}
        <div className="personal-layout">
          <div className="personal-shell">
            <div className="personal-feed">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-zinc-100">For you</h2>
                <a href="#song-catalogue" className="personal-text-button">
                  Browse all matches <span aria-hidden="true">↗</span>
                </a>
              </div>
              {suggestions.length ? suggestions.map((item, index) => (
                <RecommendationRow
                  key={item.song.id}
                  item={item}
                  featured={index === 0}
                  favorite={favorites.includes(item.song.id)}
                  onFavorite={onFavorite}
                />
              )) : (
                <div className="personal-empty">
                  <h3 className="text-lg font-medium text-zinc-200">No songs match these preferences</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    Add a few known chords, adjust your practice level or reset hidden suggestions in your preferences.
                  </p>
                  <button className="personal-text-button mt-4" onClick={() => setEditing(true)}>
                    Adjust preferences
                  </button>
                </div>
              )}
            </div>
          </div>
          <aside className="personal-side" aria-labelledby="practice-heading">
            <div className="personal-shell">
              <div className="personal-history">
                <h2 id="practice-heading" tabIndex={-1} className="text-lg font-semibold tracking-tight text-zinc-100">Recently practised</h2>
                {recent.length ? (
                  <ul className="mt-5 divide-y divide-white/5">
                    {recent.map(entry => (
                      <li key={entry.songId} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                        <div className="min-w-0 flex-1">
                        <Link href={`/app/song/${entry.songId}`} data-workspace-link={`practice-${entry.songId}`} className="block truncate text-sm font-medium text-zinc-200 hover:text-amber-300">
                          {entry.song!.title}
                        </Link>
                        <p className="mt-1 text-xs text-zinc-500">
                          {localDay(entry.practicedAt) === localDay(now)
                            ? "Practised today"
                            : new Date(entry.practicedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </p>
                        </div>
                        <button type="button" className="personal-text-button min-h-11 shrink-0"
                          aria-label={`Remove ${entry.song!.title} from practice history`}
                          onClick={event => {
                            const next = event.currentTarget.closest("li")?.nextElementSibling?.querySelector<HTMLButtonElement>("button")
                              ?? document.getElementById("practice-heading");
                            removePractice(entry.songId);
                            setPracticeNotice(`${entry.song!.title} removed from practice history.`);
                            next?.focus({ preventScroll: true });
                          }}>Remove</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-5 text-sm leading-relaxed text-zinc-400">
                    Mark a song as practised to build your history and shape your next recommendations.
                  </p>
                )}
                <p role="status" className="sr-only">{practiceNotice}</p>
              </div>
            </div>
          </aside>
        </div>
        {preferencesOpen && (
          <div className="personal-data-controls">
            <button className="personal-text-button" onClick={() => setConfirmReset(true)}>
              Reset personalization
            </button>
            {confirmReset && (
              <div className="personal-reset" role="group" aria-label="Confirm personalization reset">
                <p>Clear preferences, practice history and hidden suggestions? Your saved chords and favourites will stay.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button className="personal-text-button text-amber-300" onClick={() => {
                    resetPersonalization();
                    setResetVersion(version => version + 1);
                    setConfirmReset(false);
                  }}>
                    Clear personalization
                  </button>
                  <button className="personal-text-button" onClick={() => setConfirmReset(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      {(nextChord || learningLoading || otherLearning.length > 0) && (
        <section id="learn-next" className="scroll-mt-24 space-y-6" aria-labelledby="learn-next-heading">
          <h2 id="learn-next-heading" className="personal-heading">Learn next.</h2>
          <LearnNextPanel
            personalizedRecommendation={nextChord ? {
              chord: nextChord.chord,
              unlock_count: nextChord.songs.length,
              unlocked_songs: nextChord.songs.map(song => song.title),
              is_barre: BARRE_CHORDS.has(nextChord.chord),
            } : undefined}
            recommendations={otherLearning}
            onAddChord={onAddChord}
            onPreviewChord={onPreviewChord}
            loading={learningLoading}
          />
        </section>
      )}
    </>
  );
}
