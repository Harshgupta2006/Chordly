export const guitarStrings = [
  { note: "E2", name: "Low E", midi: 40 },
  { note: "A2", name: "A", midi: 45 },
  { note: "D3", name: "D", midi: 50 },
  { note: "G3", name: "G", midi: 55 },
  { note: "B3", name: "B", midi: 59 },
  { note: "E4", name: "High E", midi: 64 },
] as const;

export const targetHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export type TuningReading = { cents: number; status: "Tune up" | "In tune" | "Tune down" | "Check the selected string" };

// YIN's normalized difference function finds repetition even when the strongest
// harmonic is above the fundamental. Interpolating the trough preserves cents precision.
function pitch(frame: Float32Array, rate: number, difference: Float32Array) {
  let sum = 0, energy = 0;
  for (const x of frame) { sum += x; energy += x * x; }
  if (energy / frame.length - (sum / frame.length) ** 2 < 0.003 ** 2) return null;
  const maxLag = difference.length - 1;
  const count = frame.length - maxLag;
  let cumulative = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let squared = 0;
    for (let i = 0; i < count; i++) squared += (frame[i] - frame[i + lag]) ** 2;
    cumulative += squared;
    difference[lag] = cumulative ? squared * lag / cumulative : 1;
  }
  for (let lag = Math.max(2, Math.floor(rate / 900)); lag < maxLag - 1; lag++) {
    if (difference[lag] >= 0.10) continue;
    while (lag < maxLag - 1 && difference[lag + 1] < difference[lag]) lag++;
    // A dominant second harmonic can create an earlier, shallower trough.
    const twice = lag * 2;
    if (twice + 2 < maxLag && difference[lag] > 0.015) {
      let best = twice;
      for (let i = twice - 2; i <= twice + 2; i++) if (difference[i] < difference[best]) best = i;
      if (difference[best] < difference[lag] * 0.2) lag = best;
    }
    const left = difference[lag - 1], center = difference[lag], right = difference[lag + 1];
    const curvature = left + right - 2 * center;
    const offset = curvature > 0 ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curvature))) : 0;
    return rate / (lag + offset);
  }
  return null;
}

/** Overlapping 80 ms windows, bounded storage and about 12 kHz analysis at any mic rate. */
export function createTuner(rate: number, target: number, report: (reading: TuningReading | null) => void) {
  const stride = Math.max(1, Math.round(rate / 12000));
  const analysisRate = rate / stride;
  const frame = new Float32Array(Math.round(analysisRate * 0.08));
  const hop = Math.floor(frame.length / 2);
  const difference = new Float32Array(Math.ceil(analysisRate / 45) + 1);
  const history: number[] = [];
  let filled = 0, partial = 0, samples = 0;

  function read(): TuningReading | null {
    const hz = pitch(frame, analysisRate, difference);
    if (!hz) { history.length = 0; return null; }
    history.push(1200 * Math.log2(hz / target));
    if (history.length > 3) history.shift();
    if (history.length < 3 || Math.max(...history) - Math.min(...history) > 10) return null;
    const cents = [...history].sort((a, b) => a - b)[1];
    if (Math.abs(cents) <= 5 && !history.every(value => Math.abs(value) <= 5)) return null;
    const status = Math.abs(cents) > 200 ? "Check the selected string"
      : Math.abs(cents) <= 5 ? "In tune" : cents < 0 ? "Tune up" : "Tune down";
    return { cents: Math.round(cents), status };
  }

  return (pcm: Float32Array) => {
    for (const value of pcm) {
      partial += value;
      if (++samples < stride) continue;
      frame[filled++] = partial / stride;
      partial = 0; samples = 0;
      if (filled === frame.length) {
        report(read());
        frame.copyWithin(0, hop);
        filled -= hop;
      }
    }
  };
}
