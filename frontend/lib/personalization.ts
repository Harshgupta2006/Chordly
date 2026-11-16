import featureData from "../data/recommendationFeatures.json";
import { PersonalProfile, PersonalizedSong, Song } from "./types";
import { GENRE_LABELS } from "./personalizationStorage";

export interface ContentFeatures {
  version: number;
  feature_names: string[];
  vectors: Record<string, number[]>;
  ranking: { chord: number; content: number; genre: number; difficulty: number; recent_penalty: number };
}

export interface RecommendationInput {
  songs: Song[];
  profile: PersonalProfile;
  knownChords: string[];
  favorites: number[];
  now?: number;
  features?: ContentFeatures;
}

export function rankPersonalizedSongs(input: RecommendationInput, includeFavorites = false): PersonalizedSong[] {
  const { songs, profile, knownChords, favorites, now = Date.now() } = input;
  const features = input.features || featureData as ContentFeatures;
  const known = new Set(knownChords);
  const saved = new Set(favorites);
  const dismissed = new Set(profile.dismissedSongIds);
  const day = 86400000;
  const seedWeights = new Map<number, number>();
  const lastPractice = new Map<number, number>();
  const hasFavoriteSeeds = favorites.some(id => features.vectors[String(id)]);
  const hasPracticeSeeds = profile.history.some(entry => features.vectors[String(entry.songId)]);
  for (const id of saved) seedWeights.set(id, 3);
  const practiceWeights = new Map<number, number>();
  for (const entry of profile.history) {
    const age = Math.max(0, (now - Date.parse(entry.practicedAt)) / day);
    practiceWeights.set(entry.songId, Math.min(3, (practiceWeights.get(entry.songId) || 0) + 2 * Math.pow(.5, age / 30)));
    lastPractice.set(entry.songId, Math.max(lastPractice.get(entry.songId) || 0, Date.parse(entry.practicedAt)));
  }
  for (const [id, weight] of practiceWeights) seedWeights.set(id, (seedWeights.get(id) || 0) + weight);
  const taste = new Array<number>(features.feature_names.length).fill(0);
  for (const [id, weight] of seedWeights) {
    const vector = features.vectors[String(id)];
    if (!vector || vector.length !== taste.length) continue;
    for (let index = 0; index < taste.length; index++) taste[index] += vector[index] * weight;
  }
  const norm = Math.sqrt(taste.reduce((sum, value) => sum + value * value, 0));
  if (norm > 0) {
    for (let index = 0; index < taste.length; index++) taste[index] /= norm;
  }
  const ranked: PersonalizedSong[] = [];
  for (const song of songs) {
    if (dismissed.has(song.id) || (!includeFavorites && saved.has(song.id)) || song.difficulty > profile.preferences.maxDifficulty) continue;
    const missing = song.chords.filter(chord => !known.has(chord));
    if (missing.length > 2) continue;
    const chordFit = profile.preferences.goal === "learn" ? [0.7, 1, 0.6][missing.length] : [1, 0.6, 0.3][missing.length];
    const vector = features.vectors[String(song.id)];
    const contentFit = vector?.length === taste.length
      ? vector.reduce((sum, value, index) => sum + value * taste[index], 0) : 0;
    const genreFit = Number(profile.preferences.genres.includes(song.genre));
    const difficultyFit = 1 - (profile.preferences.maxDifficulty - song.difficulty) / 4;
    const weights = features.ranking;
    let score = weights.chord * chordFit + weights.content * contentFit + weights.genre * genreFit + weights.difficulty * difficultyFit;
    const practicedAt = lastPractice.get(song.id);
    if (practicedAt && now - practicedAt < 3 * day) score -= weights.recent_penalty;
    const reasons = [missing.length ? `Learn ${missing.join(" and ")} to play this` : "Uses chords you know"];
    if (genreFit) reasons.push(`Matches your ${GENRE_LABELS[song.genre] || song.genre} preference`);
    else if (contentFit > .1 && hasFavoriteSeeds) reasons.push("Similar to your favourites");
    else if (contentFit > .1 && hasPracticeSeeds) reasons.push("Inspired by your practice history");
    ranked.push({ song, score, missing, reasons });
  }
  return ranked.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length || a.song.difficulty - b.song.difficulty || a.song.id - b.song.id);
}

export function selectDiscoverySongs(ranked: PersonalizedSong[], limit = 5): PersonalizedSong[] {
  const selected: PersonalizedSong[] = [];
  const artistCounts = new Map<string, number>();
  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    const count = artistCounts.get(candidate.song.artist) || 0;
    if (count >= 2) continue;
    selected.push(candidate);
    artistCounts.set(candidate.song.artist, count + 1);
  }
  return selected;
}

export function personalizedNextChord(ranked: PersonalizedSong[], barreChords: Set<string>) {
  const candidates = new Map<string, { chord: string; score: number; songs: Song[] }>();
  for (const item of ranked) {
    if (item.missing.length !== 1) continue;
    const chord = item.missing[0];
    const candidate = candidates.get(chord) || { chord, score: 0, songs: [] };
    candidate.score += item.score;
    candidate.songs.push(item.song);
    candidates.set(chord, candidate);
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || Number(barreChords.has(a.chord)) - Number(barreChords.has(b.chord)) || a.chord.localeCompare(b.chord))[0] || null;
}
