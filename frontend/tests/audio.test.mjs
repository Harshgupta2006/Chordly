import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/audio.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = { exports: {}, Blob, FormData, AbortController, process, fetch };
vm.runInNewContext(compiled, sandbox);

test("PCM WAV header and signed samples decode correctly", async () => {
  const blob = sandbox.exports.encodeWav([new Float32Array([-1, -0.5]), new Float32Array([0, 0.5, 1])], 48000);
  const data = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(data.byteLength, 54);
  assert.equal(data.getUint32(24, true), 48000);
  assert.equal(data.getUint16(22, true), 1);
  assert.equal(data.getUint32(40, true), 10);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => data.getInt16(44 + 2 * i, true)), [-32768, -16384, 0, 16384, 32767]);
});

test("prediction uses multipart WAV and surfaces backend errors", async () => {
  let submitted;
  sandbox.fetch = async (url, options) => {
    submitted = { url, options };
    return { ok: false, json: async () => ({ detail: "Only WAV audio is supported." }) };
  };
  await assert.rejects(sandbox.exports.predictChord(new Blob(["audio"]), new AbortController().signal), /Only WAV/);
  assert.match(submitted.url, /\/audio\/predict-chord$/);
  assert.equal(submitted.options.body.get("audio").name, "strum.wav");
  assert.equal(submitted.options.headers, undefined);
});

test("AudioWorklet averages stereo input and transfers isolated PCM", () => {
  let Processor;
  const packets = [];
  class Base { constructor() { this.port = { postMessage: (message) => packets.push(message) }; } }
  vm.runInNewContext(fs.readFileSync(new URL("../public/audio-capture-worklet.js", import.meta.url), "utf8"), {
    AudioWorkletProcessor: Base,
    registerProcessor: (name, implementation) => { assert.equal(name, "chordly-capture"); Processor = implementation; },
  });
  const processor = new Processor();
  assert.equal(processor.process([[new Float32Array([1, 0]), new Float32Array([0, 1])]]), true);
  assert.deepEqual(Array.from(packets[0]), [0.5, 0.5]);
});
