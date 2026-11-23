import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/tuner.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { createTuner, guitarStrings, targetHz } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
const reference = [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276];
const tone = hz => t => 0.15 * Math.sin(2 * Math.PI * hz * t);

function feed(analyze, rate, signal, duration = 0.32) {
  const pcm = Float32Array.from({ length: Math.round(rate * duration) }, (_, i) => signal(i / rate));
  for (let i = 0; i < pcm.length; i += 128) analyze(pcm.subarray(i, i + 128));
}

test("all six open strings resolve against A440 across microphone rates", () => {
  for (const rate of [44100, 48000, 96000]) {
    for (const [i, hz] of reference.entries()) {
      for (const offset of [-24, -6, -4, 0, 4, 6, 24]) {
        const readings = [];
        feed(createTuner(rate, targetHz(guitarStrings[i].midi), value => readings.push(value)),
          rate, tone(hz * 2 ** (offset / 1200)));
        const result = readings.at(-1);
        assert.ok(Math.abs(result?.cents - offset) <= 1, `${rate} Hz: ${hz} at ${offset} cents`);
        assert.equal(result.status, offset < -5 ? "Tune up" : offset > 5 ? "Tune down" : "In tune");
        assert.deepEqual(readings.slice(0, 2), [null, null]);
      }
    }
  }
});

test("a dominant second harmonic resolves to the plucked fundamental", () => {
  for (const hz of reference) {
    const readings = [];
    feed(createTuner(48000, hz, value => readings.push(value)), 48000, t =>
      Math.exp(-2 * t) * (0.04 * Math.sin(2 * Math.PI * hz * t) + 0.20 * Math.sin(4 * Math.PI * hz * t)));
    assert.equal(readings.at(-1)?.status, "In tune", String(hz));
  }
});

test("harmonic-rich plucks track their actual pitch even when detuned", () => {
  const spectra = [[1], [0.07, 1], [0.13, 0.08, 1], [0.3, 1, 0.6, 0.1, 0.2], [0.12, 0.1, 0.14, 0.09, 1]];
  for (const amplitudes of spectra) {
    for (const hz of reference) {
      for (const offset of [-18, 0, 18]) {
        for (const rate of [44100, 48000]) {
          const frequency = hz * 2 ** (offset / 1200);
          const readings = [];
          feed(createTuner(rate, hz, reading => readings.push(reading)), rate, t => {
            const wave = amplitudes.reduce((total, amplitude, index) => total +
              amplitude * Math.sin(2 * Math.PI * frequency * (index + 1) * t + 0.21 * index), 0);
            return 0.15 * Math.exp(-2 * t) * wave;
          }, 0.48);
          const settled = readings.slice(-3);
          assert.ok(settled.every(r => r && Math.abs(r.cents - offset) <= 2),
            `${hz} Hz, ${offset} cents, ${rate} Hz sample rate, partials ${amplitudes}`);
        }
      }
    }
  }
});

test("a wrong string prompts a string check and a fading or unstable signal clears the reading", () => {
  const readings = [];
  const analyze = createTuner(48000, 110, value => readings.push(value));
  feed(analyze, 48000, tone(146.8324));
  assert.equal(readings.at(-1)?.status, "Check the selected string");
  feed(analyze, 48000, () => 0);
  assert.equal(readings.at(-1), null);
  feed(analyze, 48000, t => tone(110)(t) * 0.005);
  assert.equal(readings.at(-1), null);
  readings.length = 0;
  feed(analyze, 48000, t => 0.1 * Math.sin(2 * Math.PI * (100 * t + 50 * t * t)));
  assert.ok(readings.every(x => x === null));
});

test("quiet fan hum and broadband air noise do not produce guidance", () => {
  let seed = 1;
  for (const airflow of [0.002, 0.025]) {
    const readings = [];
    feed(createTuner(48000, reference[0], value => readings.push(value)), 48000, t => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return airflow * (seed / 2 ** 32 - 0.5) + 0.001 * Math.sin(2 * Math.PI * 60 * t);
    });
    assert.ok(readings.length > 3 && readings.every(x => x === null));
  }
});
