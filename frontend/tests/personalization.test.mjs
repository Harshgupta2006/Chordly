import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadTypeScript } from "../scripts/recommendation-runtime.mjs";

const load = (name, globals) => loadTypeScript(fileURLToPath(new URL(`../lib/${name}.ts`, import.meta.url)), globals);
const store = load("personalizationStorage");
const engine = load("personalization");
const now = Date.parse("2026-11-16T10:00:00Z");
const songs = [
  { id: 1, title: "Rock seed", artist: "One", genre: "rock", difficulty: 1, chords: ["C", "G"] },
  { id: 2, title: "Rock discovery", artist: "Two", genre: "rock", difficulty: 1, chords: ["C", "G"] },
  { id: 3, title: "Country discovery", artist: "Three", genre: "country", difficulty: 1, chords: ["C", "G"] },
  { id: 4, title: "Learn A", artist: "Four", genre: "rock", difficulty: 2, chords: ["C", "A"] },
  { id: 5, title: "Beyond level", artist: "Five", genre: "rock", difficulty: 5, chords: ["C", "G"] },
  { id: 6, title: "Too many new chords", artist: "Six", genre: "rock", difficulty: 1, chords: ["A", "B", "D"] },
];
const features = {
  version: 1, feature_names: ["rock", "country"],
  vectors: { 1: [1, 0], 2: [1, 0], 3: [0, 1], 4: [1, 0], 5: [1, 0], 6: [1, 0] },
  ranking: { chord: .45, content: .3, genre: .15, difficulty: .1, recent_penalty: .15 },
};
function rank(profile = store.emptyProfile(), favorites = []) {
  return engine.rankPersonalizedSongs({ songs, profile, favorites, knownChords: ["C", "G"], now, features });
}

test("preferences and interaction signals alter compatible recommendations", () => {
  const profile = store.emptyProfile();
  profile.preferences.genres = ["country"];
  assert.equal(rank(profile)[0].song.id, 3);
  profile.preferences.genres = [];
  assert.equal(rank(profile, [1])[0].song.id, 2);
  profile.history = [{ songId: 1, practicedAt: new Date(now - 86400000).toISOString() }];
  assert.equal(rank(profile)[0].song.id, 2);
  assert.ok(rank(profile)[0].reasons.some(reason => reason.includes("practice")));
});

test("known chords, level, hidden songs and favourites constrain discovery", () => {
  const profile = store.emptyProfile();
  profile.dismissedSongIds = [2];
  const result = rank(profile, [1]);
  assert.deepEqual(Array.from(result, item => item.song.id).sort(), [3, 4]);
  const suggestion = engine.personalizedNextChord(result, new Set());
  assert.equal(suggestion.chord, "A");
  assert.equal(suggestion.songs[0].id, 4);
  assert.equal(engine.personalizedNextChord([], new Set()), null);
});

test("learning focus favours a one-chord challenge and rankings are stable", () => {
  const profile = store.emptyProfile();
  profile.preferences.goal = "learn";
  assert.equal(rank(profile)[0].song.id, 4);
  assert.deepEqual(Array.from(rank(profile), item => item.song.id), Array.from(rank(profile), item => item.song.id));
});

test("artist diversity retains the model order and limits repeats", () => {
  const candidates = rank().map(item => ({ ...item, song: { ...item.song, artist: "Same artist" } }));
  assert.equal(engine.selectDiscoverySongs(candidates).length, 2);
});

test("invalid or future profile entries are sanitized and daily duplicates are removed", () => {
  const profile = store.sanitizeProfile({ version: 1, onboarded: true,
    preferences: { genres: ["rock", "invalid", "rock"], maxDifficulty: 50, goal: "bad" },
    history: [{ songId: 1, practicedAt: new Date(now).toISOString() }, { songId: 1, practicedAt: new Date(now).toISOString() },
      { songId: 2, practicedAt: "invalid" }, { songId: -1, practicedAt: new Date(now).toISOString() },
      { songId: 2, practicedAt: new Date(now + 86400000).toISOString() }],
    dismissedSongIds: [1, 1, -1, "bad"] }, now);
  assert.equal(profile.history.length, 1);
  assert.equal(profile.preferences.maxDifficulty, 3);
  assert.deepEqual(Array.from(profile.preferences.genres), ["rock"]);
  assert.deepEqual(Array.from(profile.dismissedSongIds), [1]);
});

test("practice writes once per song per local day and reset preserves legacy storage", () => {
  const values = new Map([["chordly_practice_list_v1", '{"favorites":[1],"learnedChords":["C"]}']]);
  const events = [];
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, dispatchEvent: event => events.push(event.type) };
  const storage = load("personalizationStorage", { window });
  const first = new Date(Date.now() - 86400000 * 2);
  storage.recordPractice(1, first);
  storage.recordPractice(1, first);
  storage.recordPractice(1, new Date(first.getTime() + 86400000));
  assert.equal(storage.readProfile().profile.history.length, 2);
  assert.equal(events.length, 2);
  storage.resetPersonalization();
  assert.equal(storage.readProfile().profile.history.length, 0);
  assert.ok(values.get("chordly_practice_list_v1").includes('"favorites":[1]'));
});

test("blocked storage keeps profile changes available for the tab session", () => {
  const window = { localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }, dispatchEvent() {} };
  const storage = load("personalizationStorage", { window });
  storage.savePreferences({ genres: ["rock"], maxDifficulty: 2, goal: "learn" });
  const state = storage.readProfile();
  assert.equal(state.persistent, false);
  assert.equal(state.profile.preferences.goal, "learn");
});

test("removing a practiced song clears its history and preserves preferences and other songs", () => {
  const values = new Map();
  const events = [];
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, dispatchEvent: event => events.push(event.type) };
  const storage = load("personalizationStorage", { window });
  storage.savePreferences({ genres: ["rock"], maxDifficulty: 2, goal: "learn" });
  storage.recordPractice(1, new Date(Date.now() - 86400000));
  storage.recordPractice(1);
  storage.recordPractice(2);
  storage.removePractice(1);
  const profile = storage.readProfile().profile;
  assert.deepEqual(Array.from(profile.history, entry => entry.songId), [2]);
  assert.equal(profile.preferences.goal, "learn");
  assert.equal(profile.preferences.genres[0], "rock");
  assert.equal(events.length, 5);
  storage.recordPractice(1);
  assert.ok(storage.readProfile().profile.history.some(entry => entry.songId === 1));
});

test("undoing today's practice retains earlier practice days", () => {
  const values = new Map();
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, dispatchEvent() {} };
  const storage = load("personalizationStorage", { window });
  const yesterday = new Date(Date.now() - 86400000);
  storage.recordPractice(1, yesterday);
  storage.recordPractice(1);
  storage.removePractice(1, storage.localDay(Date.now()));
  const history = storage.readProfile().profile.history;
  assert.equal(history.length, 1);
  assert.equal(storage.localDay(history[0].practicedAt), storage.localDay(yesterday));
});

test("the public feature artifact covers the catalogue with finite normalized vectors", () => {
  const artifact = JSON.parse(fs.readFileSync(new URL("../data/recommendationFeatures.json", import.meta.url)));
  const catalogue = JSON.parse(fs.readFileSync(new URL("../data/songs.json", import.meta.url)));
  for (const song of catalogue) {
    const vector = artifact.vectors[String(song.id)];
    assert.equal(vector.length, artifact.feature_names.length);
    assert.ok(vector.every(Number.isFinite));
    assert.ok(Math.abs(vector.reduce((sum, value) => sum + value * value, 0) - 1) < 1e-5);
  }
});
