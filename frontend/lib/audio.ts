/** Browser PCM WAV encoding avoids WebM/FFmpeg and matches our SoundFile decoder. */
export function formatChordLabel(symbol: string): string {
  const match = /^([A-G](?:#|b)?)(m)?$/.exec(symbol);
  if (!match) return symbol;
  return `${match[1]} ${match[2] ? "minor" : "major"}`;
}

export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const value of chunk) {
      const clipped = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export interface ChordPrediction {
  status: "ok" | "silence" | "noise" | "uncertain" | "unsupported";
  predicted_class: string;
  chord: string | null;
  model_score: number;
  threshold: number;
  class_scores: Record<string, number>;
  supported: boolean;
  score_explanation: string;
}

export async function predictChord(audio: Blob, signal: AbortSignal): Promise<ChordPrediction> {
  const endpoint = process.env.NODE_ENV === "production"
    ? "/api/audio/predict-chord"
    : `${(process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8100").replace(/\/$/, "")}/audio/predict-chord`;
  const body = new FormData(); body.append("audio", audio, "strum.wav");
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body, signal });
  } catch (error) {
    if (signal.aborted) throw new Error("Recognition timed out or was cancelled. Please try again.");
    throw new Error("The recognition server is unavailable. Please try again shortly.");
  }
  const result = await response.json().catch(() => {
    throw new Error("Recognition is temporarily unavailable. Please try again shortly.");
  });
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "The recording could not be processed.");
  if (!result.class_scores || typeof result.model_score !== "number" || !["ok", "silence", "noise", "uncertain", "unsupported"].includes(result.status)) {
    throw new Error("The recognition server returned an invalid result.");
  }
  return result as ChordPrediction;
}
