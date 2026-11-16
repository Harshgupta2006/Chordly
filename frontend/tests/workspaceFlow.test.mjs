import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function component(filename, imports, globals = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(`../components/${filename}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(compiled, { module, exports: module.exports, console, ...globals, require: name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  } });
  return module.exports;
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}

function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree && typeof tree === "object") return text(tree.props?.children);
  return tree == null ? "" : String(tree);
}

test("workspace and song footers scroll to the top and focus their own heading", () => {
  for (const reduced of [false, true]) {
    let scrolled, focusedId, focusOptions;
    const { WorkspaceFooter } = component("GuitarScrollScene", {
      react: {}, "next/image": {}, "@gsap/react": {},
      gsap: { gsap: { registerPlugin() {} } }, "gsap/ScrollTrigger": {}, "@/lib/guitarAnatomy": {},
    }, {
      window: { matchMedia: () => ({ matches: reduced }), scrollTo: value => { scrolled = value; } },
      document: { getElementById: id => ({ focus: options => { focusedId = id; focusOptions = options; } }) },
    });
    for (const target of ["guitar-heading", "song-heading"]) {
      const tree = WorkspaceFooter(target === "guitar-heading" ? {} : { focusTargetId: target });
      nodes(tree).find(node => node.type === "button").props.onClick();
      assert.equal(scrolled.top, 0);
      assert.equal(scrolled.behavior, reduced ? "instant" : "smooth");
      assert.equal(focusedId, target);
      assert.equal(focusOptions.preventScroll, true);
    }
  }
});

test("the logo opens the start and song Back uses the originating history entry", () => {
  let returned = 0, cleared = 0, scrolled, focused = false;
  const window = { location: { pathname: "/app" }, history: { state: { chordlySongReturn: true } },
    matchMedia: () => ({ matches: true }), scrollTo: value => { scrolled = value; } };
  const { WorkspaceHomeLink, SongBackLink } = component("WorkspaceLinks", {
    react: { useEffect: callback => callback() }, "next/link": {},
    "next/navigation": { useRouter: () => ({ back: () => returned++ }), usePathname: () => "/app/song/1" },
    "@/lib/workspaceNavigation": { clearWorkspaceVisit: () => cleared++, markSongEntry() {} },
  }, { window, document: { getElementById: () => ({ focus: () => { focused = true; } }) } });
  const event = () => ({ button: 0, prevented: false, preventDefault() { this.prevented = true; } });
  const home = WorkspaceHomeLink({ className: "", children: "Chordly" });
  home.props.onClick(event());
  assert.equal(cleared, 1);
  assert.equal(scrolled.top, 0);
  assert.equal(scrolled.behavior, "instant");
  assert.equal(focused, true);
  const back = SongBackLink({ className: "", children: "Back" });
  const internal = event();
  back.props.onClick(internal);
  assert.equal(returned, 1);
  assert.equal(internal.prevented, true);
  window.history.state.chordlySongReturn = false;
  const direct = event();
  back.props.onClick(direct);
  assert.equal(direct.prevented, false);
  assert.equal(back.props.href, "/app");
  const modified = { ...event(), ctrlKey: true };
  home.props.onClick(modified);
  assert.equal(modified.prevented, false);
  assert.equal(cleared, 1);
});

test("numbered markers highlight the matching label through pointer and keyboard input", () => {
  const values = [true, 0, null];
  let stateIndex = 0;
  const { GuitarScrollHero } = component("GuitarScrollScene", {
    react: {
      useRef: () => ({ current: null }),
      useState: () => {
        const index = stateIndex++;
        return [values[index], value => { values[index] = value; }];
      },
    },
    "next/image": {}, "@gsap/react": { useGSAP() {} },
    gsap: { gsap: { registerPlugin() {} } }, "gsap/ScrollTrigger": {},
    "@/lib/guitarAnatomy": { guitarChapters: [{
      id: "playing", title: "Playing area", parts: [{ name: "Neck", description: "Supports the fretboard." }],
    }] },
  });
  const render = () => { stateIndex = 0; return GuitarScrollHero(); };
  let tree = render();
  const marker = nodes(tree).find(node => node.props?.role === "button");
  assert.equal(marker.props.tabIndex, 0);
  marker.props.onPointerEnter();
  tree = render();
  assert.equal(nodes(tree).find(node => node.type === "button").props["aria-pressed"], true);
  assert.equal(nodes(tree).find(node => node.props?.role === "button").props["aria-pressed"], true);
  for (const key of ["Enter", " "]) {
    values[2] = null;
    let prevented = false;
    marker.props.onKeyDown({ key, preventDefault() { prevented = true; } });
    assert.equal(values[2], "Neck");
    assert.equal(prevented, true);
  }
  values[1] = null;
  assert.equal(nodes(render()).find(node => node.props?.role === "button").props.tabIndex, -1);
});

test("a supported audio result confirms its chord through the existing selection callback", () => {
  const prediction = { status: "ok", chord: "A", predicted_class: "A", model_score: .9, class_scores: { A: .9 } };
  const values = ["result", null, null, prediction, null, null];
  let stateIndex = 0, confirmed;
  const { ChordRecognition } = component("ChordRecognition", {
    react: {
      useState: () => {
        const index = stateIndex++;
        return [values[index], value => { values[index] = value; }];
      },
      useRef: value => ({ current: value }), useCallback: callback => callback, useEffect() {},
    },
    "@/lib/audio": { formatChordLabel: label => `${label} major` },
    "@/lib/chords": { CANONICAL_CHORDS_SET: new Set(["A"]) },
  });
  const tree = ChordRecognition({ onConfirm: chord => { confirmed = chord; } });
  nodes(tree).find(node => node.type === "button" && text(node).startsWith("Confirm A major")).props.onClick();
  assert.equal(confirmed, "A");
  assert.equal(values[0], "idle");
  assert.equal(values[3], null);
  assert.match(values[5], /A major added/);
});

test("the practice button toggles today's entry with a concise visible label", () => {
  let removed, recorded;
  const { PracticeButton } = component("PracticeButton", {
    "@/lib/personalizationStorage": {
      localDay: () => "today", recordPractice: id => { recorded = id; }, removePractice: (id, day) => { removed = { id, day }; },
    },
    "@/lib/usePersonalization": { usePersonalization: () => ({ loaded: true, profile: { history: [{ songId: 80, practicedAt: new Date().toISOString() }] } }) },
  });
  const button = PracticeButton({ songId: 80 });
  assert.equal(button.props.disabled, false);
  assert.equal(button.props["aria-label"], "Unmark today's practice");
  assert.equal(text(button), "Practised today");
  button.props.onClick();
  assert.equal(removed.id, 80);
  assert.equal(removed.day, "today");
  assert.equal(recorded, undefined);
});

test("the learning section prioritizes personalized advice and removes the repeated general chord", () => {
  const song = { id: 1, title: "Practice song", chords: ["C", "Am"] };
  const LearnNextPanel = () => null;
  const { PersonalizedWorkspace } = component("PersonalizedWorkspace", {
    react: { useMemo: callback => callback(), useState: value => [value, () => {}] },
    "next/link": {}, "./PracticeButton": {}, "./LearnNextPanel": { LearnNextPanel },
    "@/lib/matchingEngine": {
      getAllSongs: () => ({ total_pages: 1, items: [song] }), getAllChords: () => [], getSongById: () => song,
    },
    "@/lib/personalization": {
      rankPersonalizedSongs: () => [], selectDiscoverySongs: () => [],
      personalizedNextChord: () => ({ chord: "Am", songs: [song] }),
    },
    "@/lib/personalizationStorage": {},
    "@/lib/usePersonalization": { usePersonalization: () => ({
      profile: { onboarded: true, preferences: {}, history: [] }, loaded: true, persistent: true,
    }) },
  });
  const tree = PersonalizedWorkspace({ knownChords: ["C"], favorites: [], onFavorite() {}, onAddChord() {}, onPreviewChord() {},
    learningLoading: false, learningRecommendations: [{ chord: "Am" }, { chord: "Bm" }],
  });
  const sections = nodes(tree).filter(node => node.type === "section");
  const practice = nodes(tree).find(node => node.type === "aside");
  assert.equal(text(nodes(practice).find(node => node.props?.id === "practice-heading")), "Recently practised");
  assert.doesNotMatch(text(practice), /this week|Saved in this browser|Kept in this tab/);
  assert.equal(nodes(tree).find(node => node.props?.["aria-controls"] === "personal-preferences").props["aria-expanded"], true);
  assert.deepEqual(sections.map(node => node.props.id), ["your-session", "learn-next"]);
  const general = nodes(tree).find(node => node.type === LearnNextPanel);
  assert.deepEqual(Array.from(general.props.recommendations, item => item.chord), ["Bm"]);
  assert.equal(general.props.personalizedRecommendation.chord, "Am");
  assert.deepEqual(Array.from(general.props.personalizedRecommendation.unlocked_songs), ["Practice song"]);
});

test("personalized and general learning cards share styling and working chord actions", () => {
  let previewed, added;
  const { LearnNextPanel } = component("LearnNextPanel", {});
  const tree = LearnNextPanel({
    personalizedRecommendation: { chord: "Am", unlock_count: 11, unlocked_songs: ["BATTLE SCARS"], is_barre: false },
    recommendations: [{ chord: "Bm", unlock_count: 5, unlocked_songs: ["LOVELY"], is_barre: true }],
    loading: false, onPreviewChord: chord => { previewed = chord; }, onAddChord: chord => { added = chord; },
  });
  const cards = nodes(tree).filter(node => node.type === "article");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].props.className, cards[1].props.className);
  assert.match(text(cards[0]), /Try it with BATTLE SCARS/);
  assert.match(text(cards[1]), /Unlocks LOVELY/);
  for (const [index, chord] of ["Am", "Bm"].entries()) {
    const buttons = nodes(cards[index]).filter(node => node.type === "button");
    assert.equal(buttons[0].props.className, "learning-shape-button");
    assert.equal(buttons[1].props.className, "learning-add-button");
    buttons[0].props.onClick();
    buttons[1].props.onClick();
    assert.equal(previewed, chord);
    assert.equal(added, chord);
  }
});

test("chord hover previews require pointer movement and retain keyboard previews", () => {
  let previewed;
  const { ChordSelector } = component("ChordSelector", {
    react: {}, "../lib/chords": { QUICK_PICK_CHORDS: ["D"], CHORD_GROUPS: [{ id: "minor", label: "Minor", chords: ["Am"] }] },
  });
  const tree = ChordSelector({ selectedChords: [], previewChord: "Bm", onToggleChord() {}, onClearAll() {}, onSelectChords() {}, onInspectChord() {},
    onPreviewChord: chord => { previewed = chord; },
  });
  for (const button of nodes(tree).filter(node => node.type === "button")) {
    assert.equal(button.props.onMouseEnter, undefined);
    button.props.onPointerMove();
    assert.equal(previewed, text(button));
    previewed = null;
    button.props.onFocus();
    assert.equal(previewed, text(button));
  }
});

test("progressions distinguish playing order and expose full descriptions", () => {
  const presets = [
    { id: "pop", name: "C - G - Am - F", chords: ["C", "G", "Am", "F"], description: "The famous 4-chord progression used in hundreds of pop hits." },
    { id: "doo-wop", name: "C - Am - F - G", chords: ["C", "Am", "F", "G"], description: "The timeless 50s ballad and soul progression." },
  ];
  let selected;
  const { ProgressionPresets } = component("ProgressionPresets", {
    react: {}, "../lib/chords": { PROGRESSION_PRESETS: presets },
  });
  for (const preset of presets) {
    const tree = ProgressionPresets({ selectedChords: preset.chords, onSelectPreset: chords => { selected = chords; } });
    const buttons = nodes(tree).filter(node => node.type === "button");
    assert.equal(buttons.filter(node => node.props["aria-pressed"]).length, 1);
    const active = buttons.find(node => node.props["aria-pressed"]);
    assert.equal(active.props["aria-describedby"], `preset-description-${preset.id}`);
    active.props.onClick();
    assert.deepEqual(selected, preset.chords);
    const tooltip = nodes(active).find(node => node.props?.role === "tooltip");
    assert.equal(text(tooltip), preset.description);
    assert.equal(tooltip.props.id, active.props["aria-describedby"]);
  }
  for (const selectedChords of [[], [...presets[0].chords, "D"]]) {
    const tree = ProgressionPresets({ selectedChords, onSelectPreset() {} });
    assert.equal(nodes(tree).filter(node => node.type === "button" && node.props["aria-pressed"]).length, 0);
  }
});

test("fretboard diagrams can shrink within narrow song cards without losing their labels", () => {
  const { Fretboard } = component("Fretboard", {
    react: { useId: () => "diagram" },
    "../lib/chordCatalog": { getChordFingering: () => ({ name: "C", fingering: [-1, 3, 2, 0, 1, 0], is_barre: false }) },
  });
  for (const size of ["sm", "md", "lg"]) {
    const tree = Fretboard({ chordName: "C", size });
    const svg = nodes(tree).find(node => node.type === "svg");
    assert.match(tree.props.className, /min-w-0 max-w-full/);
    assert.match(svg.props.className, /max-w-full h-auto/);
    assert.match(svg.props["aria-label"], /C chord diagram/);
  }
});
