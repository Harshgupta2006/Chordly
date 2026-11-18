"use client";

import { useCallback, useRef, useState } from "react";
import { ChordRecognition } from "./ChordRecognition";
import { createTuner, guitarStrings, targetHz, type TuningReading } from "@/lib/tuner";
import { useMicrophone } from "@/lib/useMicrophone";

const choice = "min-h-11 rounded-lg px-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 aria-pressed:bg-zinc-700 aria-pressed:text-white focus-visible:outline-2 focus-visible:outline-amber-400";

export function AudioTools({ onConfirm, recognitionEnabled }: {
  onConfirm: (chord: string) => void; recognitionEnabled: boolean;
}) {
  const [tuning, setTuning] = useState(!recognitionEnabled);
  return (
    <div className="@container min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-5">
      {recognitionEnabled && (
        <div role="group" aria-label="Microphone tool" className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
          <button type="button" className={choice} aria-pressed={!tuning} onClick={() => setTuning(false)}>Recognize</button>
          <button type="button" className={choice} aria-pressed={tuning} onClick={() => setTuning(true)}>Tune</button>
        </div>
      )}
      {recognitionEnabled && <ChordRecognition active={!tuning} onConfirm={onConfirm} />}
      {tuning && <GuitarTuner />}
    </div>
  );
}

function GuitarTuner() {
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<"idle" | "requesting" | "listening">("idle");
  const [error, setError] = useState("");
  const [reading, setReading] = useState<TuningReading | null>(null);
  const index = useRef(0);
  const rate = useRef(0);
  const analyze = useRef<ReturnType<typeof createTuner> | null>(null);
  const string = guitarStrings[selected];

  const reset = useCallback(() => {
    rate.current = 0;
    analyze.current = null;
    setPhase("idle");
    setReading(null);
  }, []);
  const interrupted = useCallback((message: string) => {
    reset();
    setError(message);
  }, [reset]);
  const mic = useMicrophone(interrupted);

  function selectString(next: number) {
    index.current = next;
    setSelected(next);
    setReading(null);
    if (rate.current) analyze.current = createTuner(rate.current, targetHz(guitarStrings[next].midi), setReading);
  }
  function toggle() {
    setError("");
    if (phase !== "idle") { mic.release(); reset(); return; }
    setPhase("requesting");
    void mic.start(pcm => analyze.current?.(pcm), sampleRate => {
      rate.current = sampleRate;
      analyze.current = createTuner(sampleRate, targetHz(guitarStrings[index.current].midi), setReading);
      setPhase("listening");
    });
  }
  const guidance = reading?.status ?? (phase === "listening" ? `Pluck the ${string.name} string`
    : phase === "requesting" ? "Waiting for microphone…" : "Ready to tune");
  const inTune = reading?.status === "In tune";
  const marker = reading && reading.status !== "Check the selected string";

  return (
    <section aria-labelledby="tuner-title">
      <h2 id="tuner-title" className="text-base font-bold text-zinc-100">Guitar tuner</h2>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">Pick a string and play it open. Let it ring while you adjust.</p>
      <div role="group" aria-label="Select a guitar string, thickest to thinnest" className="mt-4 grid grid-cols-3 gap-1.5 @min-[22rem]:grid-cols-6">
        {guitarStrings.map((item, i) => (
          <button type="button" key={item.note} aria-label={`String ${6 - i}, ${item.name}, ${item.note}`}
            aria-pressed={selected === i} onClick={() => selectString(i)}
            className="min-h-11 rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 aria-pressed:border-amber-400 aria-pressed:bg-amber-400/10 aria-pressed:text-amber-300 focus-visible:outline-2 focus-visible:outline-amber-400">
            {item.name}
          </button>
        ))}
      </div>
      <div className="my-5 border-y border-zinc-800 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xl font-bold text-zinc-100">{string.name}</span>
          <span className="text-xs tabular-nums text-zinc-400">{targetHz(string.midi).toFixed(2)} Hz</span>
        </div>
        <div aria-hidden="true" className="relative mx-1 my-5 h-1 rounded-full bg-zinc-700">
          <span className="absolute left-1/2 top-1/2 h-4 w-px -translate-y-1/2 bg-zinc-400" />
          {marker && <span className={`absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${inTune ? "bg-emerald-400" : "bg-amber-400"}`}
            style={{ left: `${50 + Math.max(-50, Math.min(50, reading.cents))}%` }} />}
        </div>
        <div aria-hidden="true" className="flex justify-between text-xs text-zinc-400"><span>Flat</span><span>Sharp</span></div>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <p role="status" className={`text-sm font-semibold ${inTune ? "text-emerald-400" : "text-zinc-100"}`}>{guidance}</p>
          {reading && <span className="text-xs tabular-nums text-zinc-300">{reading.cents > 0 ? "+" : ""}{reading.cents} cents</span>}
        </div>
      </div>
      <button type="button" onClick={toggle} className="min-h-11 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">
        {phase === "requesting" ? "Cancel microphone request" : phase === "listening" ? "Stop tuner" : "Start tuner"}
      </button>
      {error && <p role="alert" className="mt-3 text-xs text-rose-400">{error}</p>}
      <p className="mt-3 text-xs text-zinc-400">Standard tuning · A4 = 440 Hz. Audio stays on this device.</p>
    </section>
  );
}
