import { PersonalPreferences, PersonalProfile } from "./types";

export const PROFILE_KEY = "chordly_personalization_v1";
export const PROFILE_EVENT = "chordly:personalization-changed";
export const MUSIC_GENRES = ["pop", "rock", "country", "rnb", "hiphop"];
export const GENRE_LABELS: Record<string, string> = {
  pop: "Pop", rock: "Rock", country: "Country", rnb: "R&B", hiphop: "Hip-hop",
};
let sessionProfile: string | null = null;
let useSessionProfile = false;

export function emptyProfile(): PersonalProfile {
  return {
    version: 1, onboarded: false,
    preferences: { genres: [], maxDifficulty: 3, goal: "play" },
    history: [], dismissedSongIds: [],
  };
}

export function localDay(value: string | number | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function sanitizeProfile(value: unknown, now = Date.now()): PersonalProfile {
  const result = emptyProfile();
  if (!value || typeof value !== "object") return result;
  const data = value as Partial<PersonalProfile>;
  if (data.version !== 1) return result;
  result.onboarded = data.onboarded === true;
  const preferences = data.preferences;
  if (preferences && typeof preferences === "object") {
    result.preferences.genres = Array.isArray(preferences.genres)
      ? [...new Set(preferences.genres.filter(genre => MUSIC_GENRES.includes(genre)))] : [];
    if (Number.isInteger(preferences.maxDifficulty) && preferences.maxDifficulty >= 1 && preferences.maxDifficulty <= 5) {
      result.preferences.maxDifficulty = preferences.maxDifficulty;
    }
    result.preferences.goal = preferences.goal === "learn" ? "learn" : "play";
  }
  if (Array.isArray(data.dismissedSongIds)) {
    result.dismissedSongIds = [...new Set(data.dismissedSongIds.filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 1000);
  }
  const seen = new Set<string>();
  if (Array.isArray(data.history)) {
    result.history = data.history.filter(entry => {
      if (!entry || !Number.isSafeInteger(entry.songId) || entry.songId <= 0 || typeof entry.practicedAt !== "string") return false;
      const time = Date.parse(entry.practicedAt);
      if (!Number.isFinite(time) || time < 0 || time > now + 300000) return false;
      const key = `${entry.songId}/${localDay(time)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(entry => ({ songId: entry.songId, practicedAt: new Date(entry.practicedAt).toISOString() })).sort((a, b) => Date.parse(b.practicedAt) - Date.parse(a.practicedAt)).slice(0, 500);
  }
  return result;
}

export function readProfile(): { profile: PersonalProfile; persistent: boolean } {
  if (typeof window === "undefined") return { profile: emptyProfile(), persistent: true };
  try {
    const raw = useSessionProfile ? sessionProfile : window.localStorage.getItem(PROFILE_KEY);
    let profile = emptyProfile();
    try { profile = sanitizeProfile(raw ? JSON.parse(raw) : null); } catch { /* Start with valid defaults. */ }
    return { profile, persistent: !useSessionProfile };
  } catch {
    let profile = emptyProfile();
    try { profile = sanitizeProfile(sessionProfile ? JSON.parse(sessionProfile) : null); } catch { /* Start with valid defaults. */ }
    return { profile, persistent: false };
  }
}

function writeProfile(profile: PersonalProfile): PersonalProfile {
  const next = sanitizeProfile(profile);
  if (typeof window === "undefined") return next;
  sessionProfile = JSON.stringify(next);
  try {
    window.localStorage.setItem(PROFILE_KEY, sessionProfile);
    useSessionProfile = false;
  } catch {
    useSessionProfile = true;
  }
  window.dispatchEvent(new Event(PROFILE_EVENT));
  return next;
}

export function savePreferences(preferences: PersonalPreferences): PersonalProfile {
  return writeProfile({ ...readProfile().profile, preferences, onboarded: true });
}

export function recordPractice(songId: number, now = new Date()): PersonalProfile {
  const current = readProfile().profile;
  const exists = current.history.some(entry => entry.songId === songId && localDay(entry.practicedAt) === localDay(now));
  if (exists) return current;
  return writeProfile({ ...current, history: [{ songId, practicedAt: now.toISOString() }, ...current.history] });
}

export function dismissRecommendation(songId: number): PersonalProfile {
  const current = readProfile().profile;
  return writeProfile({ ...current, dismissedSongIds: [...current.dismissedSongIds, songId] });
}

export function resetPersonalization(): PersonalProfile {
  return writeProfile(emptyProfile());
}
