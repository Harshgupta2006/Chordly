import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTypeScript } from "../scripts/recommendation-runtime.mjs";

function navigation() {
  const values = new Map();
  const window = {
    location: { pathname: "/app" },
    history: { state: { __NA: true, tree: "next-route" }, replaceState(value) { this.state = value; } },
    sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
  };
  const helpers = loadTypeScript(fileURLToPath(new URL("../lib/workspaceNavigation.ts", import.meta.url)), { window });
  return { window, ...helpers };
}

const visit = { version: 1, selectedChords: ["C", "G"], filters: { q: "love", sort: "easiest" }, favoritesOnly: true,
  previewChord: "C", scrollY: 4200, playableLimit: 12, nearLimit: 9, anchor: { key: "catalogue-playable-80", top: 240 } };

test("song navigation preserves the workspace history entry and Next.js metadata", () => {
  const nav = navigation();
  nav.rememberWorkspaceVisit(visit, "/app/song/80");
  const restored = nav.readWorkspaceVisit();
  assert.equal(restored.scrollY, 4200);
  assert.equal(restored.playableLimit, 12);
  assert.equal(restored.nearLimit, 9);
  assert.equal(restored.favoritesOnly, true);
  assert.equal(restored.filters.q, "love");
  assert.equal(nav.window.history.state.tree, "next-route");
  assert.equal(nav.window.history.state.__NA, true);
  nav.window.location.pathname = "/app/song/80";
  nav.window.history.state = { __NA: true, tree: "song-route" };
  nav.markSongEntry();
  assert.equal(nav.window.history.state.chordlySongReturn, true);
  assert.equal(nav.window.history.state.tree, "song-route");
});

test("direct song entries and external URLs do not acquire a workspace return target", () => {
  const nav = navigation();
  nav.rememberWorkspaceVisit(visit, "https://outside.example/song/80");
  assert.equal(nav.readWorkspaceVisit(), null);
  nav.window.location.pathname = "/song/80";
  nav.markSongEntry();
  assert.equal(nav.window.history.state.chordlySongReturn, undefined);
  assert.equal(nav.isSongPath("/song/80"), true);
  assert.equal(nav.isSongPath("/app/song/80?redirect=elsewhere"), false);
});

test("restoration keeps the clicked song at the same screen offset after layout changes", () => {
  const nav = navigation();
  assert.equal(nav.workspaceRestoreY(visit, 840, 3800), 4400);
  assert.equal(nav.workspaceRestoreY(visit, null, 0), 4200);
  nav.rememberWorkspaceVisit(visit, "/app/song/80");
  nav.clearWorkspaceVisit();
  assert.equal(nav.readWorkspaceVisit(), null);
  assert.equal(nav.window.history.state.__NA, true);
});

test("invalid or older navigation snapshots use safe defaults", () => {
  const nav = navigation();
  nav.window.history.state.chordlyWorkspaceVisit = { ...visit, scrollY: "invalid" };
  assert.equal(nav.readWorkspaceVisit(), null);
  nav.window.history.state.chordlyWorkspaceVisit = { ...visit, selectedChords: ["C", "INVALID"], nearLimit: -5, anchor: { key: '"]script', top: 5 } };
  const result = nav.readWorkspaceVisit();
  assert.deepEqual(Array.from(result.selectedChords), ["C"]);
  assert.equal(result.nearLimit, 3);
  assert.equal(result.anchor, null);
});

test("favorites include saved songs even when several chords are still unknown", () => {
  const engine = loadTypeScript(fileURLToPath(new URL("../lib/matchingEngine.ts", import.meta.url)));
  const song = engine.getAllSongs({ limit: 100 }).items.find(item => item.chords.length > 2);
  const result = engine.matchSongs([], {}, { songIds: [song.id], includeAllMissing: true });
  assert.equal(result.playable.length, 0);
  assert.equal(result.near.length, 1);
  assert.equal(result.near[0].song.id, song.id);
  assert.equal(result.near[0].missing_count, song.chords.length);
  assert.equal(engine.matchSongs([], {}, { songIds: [], includeAllMissing: true }).near.length, 0);
});

test("section shortcuts wait for layout and keep the target below the fixed header", () => {
  const frames = [];
  let scrolled, focused;
  const section = { getBoundingClientRect: () => ({ top: -2400 }) };
  const helpers = loadTypeScript(fileURLToPath(new URL("../lib/workspaceNavigation.ts", import.meta.url)), {
    requestAnimationFrame: callback => frames.push(callback),
    getComputedStyle: () => ({ scrollMarginTop: "96px" }),
    window: { scrollY: 6000, scrollTo: options => { scrolled = options; } },
    document: { getElementById: id => id === "your-chords" ? section : { focus: options => { focused = options; } } },
  });
  helpers.jumpToWorkspaceSection("your-chords", "chord-inspector");
  assert.equal(scrolled, undefined);
  frames.shift()();
  assert.equal(scrolled, undefined);
  frames.shift()();
  assert.equal(scrolled.top, 3504);
  assert.equal(scrolled.behavior, "instant");
  assert.equal(focused.preventScroll, true);
});
