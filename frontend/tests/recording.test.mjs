import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync(new URL("../components/ChordRecognition.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const micSource = ts.transpileModule(fs.readFileSync(new URL("../lib/useMicrophone.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

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

function recorder() {
  const slots = [], cleanups = [], timers = new Map(), contexts = [], processors = [], calls = [];
  let cursor = 0, permission;
  const track = { stopped: false, stop() { this.stopped = true; } };
  const input = { getTracks: () => [track], getAudioTracks: () => [track] };
  const document = { hidden: false, addEventListener: (_, callback) => { document.interrupt = callback; }, removeEventListener() {} };
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => value !== slots[index].dependencies[i])) {
        slots[index] = { callback, dependencies };
      }
      return slots[index].callback;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => value !== slots[index].dependencies[i])) {
        slots[index]?.cleanup?.();
        const cleanup = callback();
        slots[index] = { cleanup, dependencies };
        cleanups.push(cleanup);
      }
    },
  };
  class AudioContext {
    constructor() { this.state = "suspended"; this.sampleRate = 48000; this.audioWorklet = { addModule: async () => {} }; contexts.push(this); }
    resume() { calls.push("resume"); this.state = "running"; return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {} }; }
  }
  class AudioWorkletNode {
    constructor() { this.port = { close() {} }; processors.push(this); }
    connect() {}
    disconnect() { this.disconnected = true; }
  }
  const prediction = { status: "silence", predicted_class: "F", chord: null, model_score: .9, class_scores: { F: .9, Noise: .1 } };
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const mic = {};
  const globals = {
    exports: module.exports, module, Blob, DOMException, AudioContext, AudioWorkletNode, document,
    window: { isSecureContext: true, addEventListener() {}, removeEventListener() {} },
    navigator: { mediaDevices: { getUserMedia() { calls.push("permission"); return new Promise(resolve => { permission = resolve; }); } } },
    URL: { createObjectURL: () => "blob:recording", revokeObjectURL() {} },
    setTimeout(callback, milliseconds) { const id = {}; timers.set(id, { callback, milliseconds }); return id; },
    clearTimeout: id => timers.delete(id), AbortController,
    require(name) {
      if (name === "@/lib/useMicrophone") return mic;
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/chords") return { CANONICAL_CHORDS_SET: new Set(["F"]) };
      if (name === "@/lib/audio") return {
        formatChordLabel: symbol => `${symbol} major`, encodeWav: () => new Blob(["wav"]),
        predictChord: async () => prediction,
      };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(micSource, { ...globals, exports: mic });
  vm.runInNewContext(compiled, globals);
  const render = (active = true) => {
    cursor = 0;
    module.exports.ChordRecognition({ active, onConfirm() {} });
    cursor = 0;
    return module.exports.ChordRecognition({ active, onConfirm() {} });
  };
  return {
    render, contexts, processors, calls, track, document, prediction,
    allow: () => permission(input),
    button: name => nodes(render()).find(node => node.type === "button" && text(node) === name),
    fire: milliseconds => [...timers.values()].find(timer => timer.milliseconds === milliseconds).callback(),
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

test("microphone starts audio during the tap and cancels a pending permission request safely", async () => {
  const view = recorder();
  const pending = view.button("Record a strum").props.onClick();
  assert.deepEqual(view.calls, ["resume", "permission"]);
  view.button("Cancel microphone request").props.onClick();
  assert.equal(view.contexts[0].state, "closed");
  view.allow();
  await pending;
  assert.equal(view.track.stopped, true);
  assert.equal(view.processors.length, 0);
  assert.ok(view.button("Record a strum"));
});

test("a permission timeout ignores late resolution and leaves recording available", async () => {
  const view = recorder();
  const pending = view.button("Record a strum").props.onClick();
  view.fire(20000);
  assert.match(text(view.render()), /startup timed out/);
  view.allow();
  await pending;
  assert.equal(view.track.stopped, true);
  assert.ok(view.button("Record a strum"));
});

test("automatic stop produces a reviewable recording and releases the microphone", async () => {
  const view = recorder();
  const pending = view.button("Record a strum").props.onClick();
  view.allow();
  await pending;
  view.processors[0].port.onmessage({ data: new Float32Array(48000) });
  view.fire(3000);
  assert.equal(view.track.stopped, true);
  assert.equal(view.contexts[0].state, "closed");
  assert.equal(view.processors[0].port.onmessage, null);
  assert.ok(view.button("Recognize recording"));
});

test("hiding the page interrupts capture and stops every microphone track", async () => {
  const view = recorder();
  const pending = view.button("Record a strum").props.onClick();
  view.allow();
  await pending;
  view.document.hidden = true;
  view.document.interrupt();
  assert.equal(view.track.stopped, true);
  assert.match(text(view.render()), /page was hidden/);
  assert.ok(view.button("Record a strum"));
});

test("switching tools releases a recording in progress and retains a completed take", async () => {
  for (const complete of [false, true]) {
    const view = recorder();
    const pending = view.button("Record a strum").props.onClick();
    view.allow();
    await pending;
    view.processors[0].port.onmessage({ data: new Float32Array(48000) });
    if (complete) view.fire(3000);
    assert.equal(view.render(false), null);
    assert.equal(view.track.stopped, true);
    assert.ok(view.button(complete ? "Recognize recording" : "Record a strum"));
  }
});

test("an interrupted audio context stops capture and a recording with no PCM can be retried", async () => {
  for (const interrupted of [true, false]) {
    const view = recorder();
    const pending = view.button("Record a strum").props.onClick();
    view.allow();
    await pending;
    if (interrupted) {
      view.contexts[0].state = "suspended";
      view.contexts[0].onstatechange();
    } else {
      view.fire(3000);
    }
    assert.equal(view.track.stopped, true);
    assert.match(text(view.render()), interrupted ? /capture was interrupted/ : /too short/);
    assert.ok(view.button("Record a strum"));
  }
});

test("unmounting while permission is pending releases any late microphone stream", async () => {
  const view = recorder();
  const pending = view.button("Record a strum").props.onClick();
  view.unmount();
  view.allow();
  await pending;
  assert.equal(view.track.stopped, true);
  assert.equal(view.contexts[0].state, "closed");
  assert.equal(view.processors.length, 0);
});

test("a rejected prediction never displays its winning class as a recognized chord", async () => {
  for (const status of ["silence", "noise", "uncertain", "unsupported", "ok"]) {
    const view = recorder();
    const file = Object.assign(new Blob(["wav"]), { name: "strum.wav" });
    nodes(view.render()).find(node => node.type === "input").props.onChange({ target: { files: [file], value: "" } });
    view.prediction.status = status;
    view.prediction.chord = status === "ok" ? "F" : null;
    await view.button("Recognize recording").props.onClick();
    const headings = nodes(view.render()).filter(node => node.type === "p").map(text);
    assert.ok(headings.includes(status === "ok" ? "F major" : "No confirmed chord"));
    assert.equal(Boolean(view.button("Confirm F major & add to my chords")), status === "ok");
  }
});
