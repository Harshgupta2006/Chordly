import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadTypeScript } from "../scripts/recommendation-runtime.mjs";

const { guitarChapters, projectGuitarAnchor } = loadTypeScript(
  fileURLToPath(new URL("../lib/guitarAnatomy.ts", import.meta.url)),
);

test("anatomy labels cover each chapter with valid image-relative anchors", () => {
  assert.equal(guitarChapters.length, 6);
  const names = new Set();
  for (const chapter of guitarChapters) {
    assert.ok(chapter.scale >= 1);
    assert.ok(chapter.parts.length <= 3);
    for (const part of chapter.parts) {
      assert.ok(part.x >= 0 && part.x <= 1 && part.y >= 0 && part.y <= 1);
      assert.ok(part.description.length > 20);
      assert.ok(!names.has(part.name));
      names.add(part.name);
    }
  }
  for (const name of ["Tuning machines", "Fretboard", "Strings", "Rosette", "Saddle", "Bridge pins"]) {
    assert.ok(names.has(name));
  }
});

test("pointer anchors follow the photograph through centred pan and zoom", () => {
  const image = { left: 200, top: 30, width: 400, height: 600 };
  const anchor = { x: 0.6, y: 0.2 };
  const initial = projectGuitarAnchor(anchor, image, { x: 0, y: 0, scale: 1 });
  assert.equal(initial.x, 440);
  assert.equal(initial.y, 150);
  const focused = projectGuitarAnchor(anchor, image, { x: -80, y: 360, scale: 2 });
  assert.equal(focused.x, 400);
  assert.equal(focused.y, 330);
  const resized = projectGuitarAnchor(anchor, { left: 0, top: 0, width: 200, height: 300 }, { x: -40, y: 180, scale: 2 });
  assert.equal(resized.x, 100);
  assert.equal(resized.y, 150);
});

test("reduced motion and compact screens retain the static anatomy without initializing a camera", () => {
  const source = fs.readFileSync(new URL("../components/GuitarScrollScene.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const conditions of [
    { motion: false, tall: true, desktop: true },
    { motion: true, tall: false, desktop: false },
  ]) {
    let reverted = false;
    let cleanup;
    const root = { querySelector() { assert.fail("Static layout must bypass camera setup"); } };
    const imports = {
      react: { useRef: () => ({ current: root }), useState: value => [value, () => {}] },
      "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      "next/image": { default: () => null },
      "@gsap/react": { useGSAP: callback => { cleanup = callback(); } },
      gsap: { gsap: {
        registerPlugin() {},
        matchMedia: () => ({ add: (_queries, callback) => callback({ conditions }), revert: () => { reverted = true; } }),
      } },
      "gsap/ScrollTrigger": { ScrollTrigger: {} },
      "@/lib/guitarAnatomy": { guitarChapters, projectGuitarAnchor },
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
      assert.ok(name in imports, `Unexpected import ${name}`);
      return imports[name];
    } });
    const tree = module.exports.GuitarScrollHero();
    function descendants(node) {
      if (Array.isArray(node)) return node.flatMap(descendants);
      if (!node || typeof node !== "object") return [];
      return [node, ...descendants(node.props?.children)];
    }
    assert.equal(descendants(tree).filter(node => node.type === "button").length, 0);
    assert.equal(descendants(tree).filter(node => node.type === "dd").length, 16);
    cleanup();
    assert.equal(reverted, true);
  }
});
