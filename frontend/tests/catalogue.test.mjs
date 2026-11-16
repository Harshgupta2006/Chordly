import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function catalogue() {
  const source = fs.readFileSync(new URL("../components/ResultsPanel.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const states = [], references = [], effects = [];
  let stateCursor = 0, refCursor = 0, focused = null;
  const react = {
    useState(value) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = value;
      return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef(value) {
      const index = refCursor++;
      references[index] ??= { current: value };
      return references[index];
    },
    useEffect(callback) { effects.push(callback); },
  };
  const SongCard = () => null;
  const imports = { react, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, "./SongCard": { SongCard } };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  } });
  function render(props) {
    stateCursor = 0;
    refCursor = 0;
    const tree = module.exports.ResultsPanel(props);
    references[0].current = { querySelector: selector => ({ focus: () => { focused = selector; } }) };
    effects.splice(0).forEach(effect => effect());
    return tree;
  }
  return { render, SongCard, focus: () => focused };
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

function props(playable = 15, near = 8) {
  const songs = Array.from({ length: playable + near }, (_, index) => ({ id: index + 1, title: `Song ${index + 1}`, artist: "Artist", chords: ["C"] }));
  return { results: { playable: songs.slice(0, playable), near: songs.slice(playable).map(song => ({ song, missing: ["G"] })) },
    loading: false, favorites: [], onToggleFavorite() {}, onSelectChordPreview() {}, searchFilter: "" };
}

test("catalogue starts at six playable and three near matches and expands independently", () => {
  const view = catalogue(), input = props();
  let tree = view.render(input);
  const cards = () => nodes(tree).filter(node => node.type === view.SongCard);
  assert.equal(cards().length, 9);
  assert.equal(cards().filter(node => node.props.missingChords).length, 3);
  nodes(tree).find(node => node.type === "button" && text(node).includes("Show more playable")).props.onClick();
  tree = view.render(input);
  assert.equal(cards().length, 15);
  assert.ok(text(tree).includes("12 of 15 playable songs shown"));
  tree = view.render({ ...input, favorites: [1] });
  assert.equal(cards().length, 15);
  nodes(tree).find(node => node.type === "button" && text(node).includes("Show more near")).props.onClick();
  tree = view.render(input);
  assert.equal(cards().length, 18);
});

test("search applies before truncation and empty results keep the recovery message", () => {
  const view = catalogue();
  const tree = view.render({ ...props(25, 8), searchFilter: "Song 1" });
  const cards = nodes(tree).filter(node => node.type === view.SongCard);
  assert.equal(cards.length, 6);
  assert.ok(cards.every(node => node.props.song.title.includes("Song 1")));
  assert.ok(!nodes(tree).some(node => node.type === "button" && text(node).includes("near matches")));
  assert.ok(text(view.render({ ...props(), searchFilter: "unmatched" })).includes("No songs match"));
});

test("the final expansion moves focus to the first added song when its control disappears", () => {
  const view = catalogue(), input = props(7, 4);
  let tree = view.render(input);
  nodes(tree).find(node => node.type === "button" && text(node).includes("Show more playable")).props.onClick();
  tree = view.render(input);
  assert.equal(view.focus(), 'a[href="/app/song/7"]');
  assert.ok(!nodes(tree).some(node => node.type === "button" && text(node).includes("Show more playable")));
  nodes(tree).find(node => node.type === "button" && text(node).includes("Show more near")).props.onClick();
  tree = view.render(input);
  assert.equal(view.focus(), 'a[href="/app/song/11"]');
});

test("returning to the catalogue restores the expanded lists", () => {
  const view = catalogue();
  const tree = view.render({ ...props(), initialPlayableLimit: 12, initialNearLimit: 6 });
  assert.equal(nodes(tree).filter(node => node.type === view.SongCard).length, 18);
});

test("the saved-song view explains an empty favorites list", () => {
  const tree = catalogue().render({ ...props(0, 0), favoritesView: true });
  assert.match(text(tree), /No favorites yet/);
  assert.match(text(tree), /Save a song/);
});
