import { CANONICAL_CHORDS_SET } from "./chords";
import { sanitizeFilters } from "./localStorage";
import { MatchFilters } from "./types";

const VISIT_KEY = "chordlyWorkspaceVisit";
const PENDING_KEY = "chordly_pending_song_v1";
let pendingSong: string | null = null;

export interface WorkspaceVisit {
  version: 1;
  selectedChords: string[];
  filters: MatchFilters;
  favoritesOnly: boolean;
  previewChord: string | null;
  scrollY: number;
  playableLimit: number;
  nearLimit: number;
  anchor: { key: string; top: number } | null;
}

export function isSongPath(path: string): boolean {
  return /^\/(?:app\/)?song\/[1-9]\d*$/.test(path);
}

export function readWorkspaceVisit(): WorkspaceVisit | null {
  if (typeof window === "undefined") return null;
  const value = window.history.state?.[VISIT_KEY] as Partial<WorkspaceVisit> | undefined;
  if (!value || value.version !== 1 || !Array.isArray(value.selectedChords) || !Number.isFinite(value.scrollY)) return null;
  const validLimit = (limit: unknown, fallback: number) => Number.isSafeInteger(limit) && Number(limit) >= fallback ? Number(limit) : fallback;
  const anchor = value.anchor;
  return {
    version: 1,
    selectedChords: value.selectedChords.filter(chord => typeof chord === "string" && CANONICAL_CHORDS_SET.has(chord)),
    filters: sanitizeFilters(value.filters),
    favoritesOnly: value.favoritesOnly === true,
    previewChord: typeof value.previewChord === "string" && CANONICAL_CHORDS_SET.has(value.previewChord) ? value.previewChord : null,
    scrollY: Math.max(0, value.scrollY!),
    playableLimit: validLimit(value.playableLimit, 6), nearLimit: validLimit(value.nearLimit, 3),
    anchor: anchor && typeof anchor.key === "string" && /^[a-z0-9-]+$/.test(anchor.key) && Number.isFinite(anchor.top)
      ? { key: anchor.key, top: anchor.top } : null,
  };
}

export function rememberWorkspaceVisit(visit: WorkspaceVisit, songPath: string): void {
  if (!isSongPath(songPath)) return;
  try {
    window.history.replaceState({ ...window.history.state, [VISIT_KEY]: visit }, "");
  } catch { /* Native Back can still return if a browser rejects extra history data. */ }
  pendingSong = songPath;
  try { window.sessionStorage.setItem(PENDING_KEY, songPath); } catch { /* The current tab also keeps the pending navigation in memory. */ }
}

export function markSongEntry(): void {
  let path = pendingSong;
  try { path = window.sessionStorage.getItem(PENDING_KEY) ?? path; } catch { /* Use the in-memory navigation. */ }
  if (path !== window.location.pathname || !isSongPath(path)) return;
  window.history.replaceState({ ...window.history.state, chordlySongReturn: true }, "");
  pendingSong = null;
  try { window.sessionStorage.removeItem(PENDING_KEY); } catch { /* The memory fallback was cleared above. */ }
}

export function clearWorkspaceVisit(): void {
  const state = { ...window.history.state };
  delete state[VISIT_KEY];
  window.history.replaceState(state, "", "/app");
}

export function workspaceRestoreY(visit: WorkspaceVisit, anchorTop: number | null, currentScrollY: number): number {
  return Math.max(0, anchorTop === null || !visit.anchor ? visit.scrollY : currentScrollY + anchorTop - visit.anchor.top);
}

export function jumpToWorkspaceSection(sectionId: string, focusId: string): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      if (!section) return;
      const offset = parseFloat(getComputedStyle(section).scrollMarginTop) || 96;
      window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - offset, behavior: "instant" });
      document.getElementById(focusId)?.focus({ preventScroll: true });
    });
  });
}
