"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChordPrediction, encodeWav, formatChordLabel, predictChord } from "@/lib/audio";
import { CANONICAL_CHORDS_SET } from "@/lib/chords";

type Phase = "idle" | "requesting" | "recording" | "ready" | "processing" | "result";

export function ChordRecognition({ onConfirm }: { onConfirm: (chord: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recording, setRecording] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ChordPrediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const capture = useRef<AudioWorkletNode | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const capturing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);

  const release = useCallback(() => {
    capturing.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (capture.current) {
      capture.current.port.onmessage = null;
      capture.current.disconnect();
      capture.current = null;
    }
    stream.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); }); stream.current = null;
    if (context.current) {
      context.current.onstatechange = null;
      void context.current.close().catch(() => {});
    }
    context.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; release(); request.current?.abort(); };
  }, [release]);

  useEffect(() => {
    const interrupt = () => {
      if (!document.hidden || !context.current) return;
      release();
      chunks.current = [];
      setError("Recording stopped when the page was hidden. Keep this page open and record again.");
      setPhase("idle");
    };
    document.addEventListener("visibilitychange", interrupt);
    return () => document.removeEventListener("visibilitychange", interrupt);
  }, [release]);

  useEffect(() => {
    if (!recording) { setPreview(null); return; }
    const url = URL.createObjectURL(recording); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [recording]);

  const stop = useCallback(() => {
    if (!capturing.current || !context.current) return;
    const sampleRate = context.current.sampleRate;
    const samples = chunks.current.reduce((n, chunk) => n + chunk.length, 0);
    release();
    if (samples < sampleRate * 0.25) {
      chunks.current = [];
      setError("The recording was too short. Record one strum for 1–3 seconds.");
      setPhase("idle"); return;
    }
    setRecording(encodeWav(chunks.current, sampleRate)); chunks.current = [];
    setPhase("ready");
  }, [release]);

  const start = async () => {
    if (context.current) return;
    setError(null); setNotice(null); setResult(null); setRecording(null); setPhase("requesting");
    let audioContext: AudioContext | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        throw new Error("Microphone access needs a supported browser on localhost or HTTPS.");
      }
      // Resume during the tap, before the asynchronous permission prompt loses activation.
      audioContext = new AudioContext();
      context.current = audioContext;
      if (!audioContext.audioWorklet || typeof AudioWorkletNode === "undefined") {
        throw new Error("This browser does not support microphone capture. Choose a WAV recording instead.");
      }
      const resumed = audioContext.resume();
      void resumed.catch(() => {});
      timer.current = setTimeout(() => {
        if (context.current !== audioContext) return;
        release();
        setError("Microphone startup timed out. Check the browser permission prompt and try again.");
        setPhase("idle");
      }, 20000);
      const input = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (!alive.current || context.current !== audioContext) { input.getTracks().forEach((track) => track.stop()); return; }
      stream.current = input;
      await audioContext.audioWorklet.addModule("/audio-capture-worklet.js");
      await resumed;
      if (!alive.current || context.current !== audioContext) return;
      if (audioContext.state !== "running") throw new Error("Audio capture is paused. Keep this page open and try again.");
      const node = new AudioWorkletNode(audioContext, "chordly-capture"); capture.current = node;
      chunks.current = []; capturing.current = true;
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (capturing.current) chunks.current.push(event.data);
      };
      audioContext.createMediaStreamSource(input).connect(node);
      node.connect(audioContext.destination);
      input.getAudioTracks().forEach(track => {
        track.onended = () => {
          if (context.current !== audioContext) return;
          release(); chunks.current = [];
          setError("Microphone access ended. Reconnect your microphone and record again.");
          setPhase("idle");
        };
      });
      audioContext.onstatechange = () => {
        if (context.current !== audioContext || context.current?.state === "running") return;
        release(); chunks.current = [];
        setError("Audio capture was interrupted. Keep this page open and record again.");
        setPhase("idle");
      };
      if (timer.current) clearTimeout(timer.current);
      setPhase("recording"); timer.current = setTimeout(stop, 3000);
    } catch (cause) {
      if (audioContext && context.current !== audioContext) return;
      release();
      if (!alive.current) return;
      const name = cause instanceof DOMException ? cause.name : "";
      setError(name === "NotAllowedError" ? "Microphone permission was denied. Allow access in your browser settings, then retry."
        : name === "NotFoundError" ? "No microphone was found. Connect one or choose a WAV recording."
        : name === "NotReadableError" ? "The microphone is unavailable or in use by another application."
        : cause instanceof Error ? cause.message : "Could not start the microphone.");
      setPhase("idle");
    }
  };

  const submit = async () => {
    if (!recording || request.current) return;
    setPhase("processing"); setError(null);
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const prediction = await predictChord(recording, controller.signal);
      if (alive.current) { setResult(prediction); setPhase("result"); }
    } catch (cause) {
      if (alive.current) { setError(cause instanceof Error ? cause.message : "Recognition failed."); setPhase("ready"); }
    } finally { clearTimeout(timeout); request.current = null; }
  };

  const busy = phase === "recording" || phase === "processing" || phase === "requesting";
  const canConfirm = result?.status === "ok" && result.chord && CANONICAL_CHORDS_SET.has(result.chord);
  const resultMessage = result?.status === "silence" ? "This recording is too quiet. Try another strum."
    : result?.status === "noise" ? "The model heard noise rather than a clear guitar chord."
    : result?.status === "unsupported" ? `${formatChordLabel(result.predicted_class)} is not available in the current chord library.`
    : result?.status === "uncertain" ? "The model is uncertain. Try a clearer, isolated strum." : null;
  const topScores = result ? Object.entries(result.class_scores).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];

  return (
    <section aria-labelledby="recognition-title" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recognition-title" className="text-base font-bold text-zinc-100">Recognize a guitar chord</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">Play one isolated strum in a quiet room. Review the result before adding it to your chords.</p>
      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {phase === "recording" ? (
          <button type="button" onClick={stop} className="min-h-11 rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400">Stop recording</button>
        ) : (
          <button type="button" onClick={start} disabled={busy} className="min-h-11 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">
            {phase === "requesting" ? "Requesting microphone…" : recording ? "Record again" : "Record a strum"}
          </button>
        )}
        {phase === "requesting" && (
          <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={() => { release(); setPhase("idle"); setNotice("Microphone request cancelled."); }}>Cancel microphone request</button>
        )}
        <label className={`inline-flex min-h-11 items-center justify-center rounded-xl px-2 text-sm text-zinc-400 underline underline-offset-4 ${busy ? "opacity-50" : "cursor-pointer hover:text-zinc-200"}`}>
          Choose a WAV instead
          <input type="file" accept=".wav,audio/wav,audio/x-wav" disabled={busy} className="sr-only" aria-label="Choose a WAV recording"
            onChange={(event) => {
              const file = event.target.files?.[0]; event.target.value = "";
              if (!file) return;
              setResult(null); setNotice(null); setError(null); setRecording(null); setPhase("idle");
              if (!file.name.toLowerCase().endsWith(".wav") || !file.size || file.size > 2 * 1024 * 1024) {
                setError("Choose a nonempty WAV file under 2 MiB, between 0.25 and 5 seconds long."); return;
              }
              setRecording(new Blob([file], { type: "audio/wav" })); setPhase("ready");
            }} />
        </label>
        <span role="status" aria-live="polite" className="text-xs text-zinc-400">
          {phase === "recording" ? <span className="flex items-center gap-2 text-rose-400"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />Recording · stops after 3 seconds</span>
            : phase === "processing" ? "Listening to your recording…" : notice || (phase === "ready" ? "Recording ready to review" : "")}
        </span>
      </div>
      {preview && !busy && (
        <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <audio controls src={preview} aria-label="Play back your recording" className="h-11 w-full min-w-0 sm:w-72" />
          <a href={preview} download="strum.wav" className="inline-flex min-h-11 items-center justify-center px-2 text-sm text-zinc-400 underline underline-offset-4 hover:text-zinc-200">Save WAV</a>
          <button type="button" onClick={submit} className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700">Recognize recording</button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-xs leading-relaxed text-rose-400">{error}</p>}
      {result && (
        <div className="mt-4 border-t border-zinc-800 pt-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-2xl font-black text-zinc-100">{result.status === "ok" ? formatChordLabel(result.predicted_class) : "No confirmed chord"}</p>
            <p className="text-xs text-zinc-400">Model score {Math.round(result.model_score * 100)}%</p>
          </div>
          {result.status === "ok" && <p className="mt-1 text-xs text-zinc-400">Chord symbol: {result.predicted_class}</p>}
          {resultMessage && <p className="mt-2 text-xs text-amber-400">{resultMessage}</p>}
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">This score is not a measured chance of correctness. A new guitar or microphone can produce confident mistakes.</p>
          <dl aria-label="Model class scores" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
            {topScores.map(([label, score]) => <div key={label} className="flex gap-2"><dt>{formatChordLabel(label)}</dt><dd>{(score * 100).toFixed(1)}%</dd></div>)}
          </dl>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {canConfirm && <button type="button" className="min-h-11 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
              onClick={() => {
                if (result.chord && CANONICAL_CHORDS_SET.has(result.chord)) {
                  onConfirm(result.chord); setNotice(`${formatChordLabel(result.chord)} added to your known chords.`);
                  setResult(null); setRecording(null); setPhase("idle");
                }
              }}>Confirm {formatChordLabel(result.chord!)} &amp; add to my chords</button>}
            <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
              onClick={() => { setResult(null); setRecording(null); setPhase("idle"); setNotice("Result discarded. Your known chords were not changed."); }}>Discard result</button>
          </div>
        </div>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">Submitting sends this recording to Chordly for recognition. Recordings are discarded after processing. Choose Save WAV to keep a copy yourself.</p>
    </section>
  );
}
