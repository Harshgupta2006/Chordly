"use client";

import React, { useId } from "react";
import { Chord } from "../lib/types";
import { getChordFingering } from "../lib/chordCatalog";

const STRING_NAMES = ["E", "A", "D", "G", "B", "E"] as const;

interface FretboardProps {
  chord?: Chord | null;
  chordName?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTitle?: boolean;
  showLabels?: boolean;
  dotColor?: string;
}

export function Fretboard({
  chord: providedChord,
  chordName,
  size = "md",
  className = "",
  showTitle = true,
  showLabels = true,
  dotColor = "rgb(52 211 153)",
}: FretboardProps) {
  const componentId = useId();

  // Resolve chord data from props or static catalog
  const targetName = providedChord?.name || chordName || "";
  const chordData = providedChord || (targetName ? getChordFingering(targetName) : null);

  if (!chordData || !chordData.fingering || chordData.fingering.length !== 6) {
    return (
      <div className={`flex flex-col items-center justify-center h-full min-h-[140px] text-center ${className}`}>
        {showTitle && <span className="font-bold text-zinc-100 text-sm mb-6">{targetName}</span>}
        <span className="text-xs text-zinc-500 font-medium">Diagram coming soon</span>
      </div>
    );
  }

  const { name, fingering, is_barre } = chordData;

  // Geometry dimensions
  const scale = size === "sm" ? 0.75 : size === "lg" ? 1.4 : 1.0;
  const width = 160 * scale;
  const height = (showLabels ? 204 : 190) * scale;

  const topMargin = 38 * scale;
  const bottomMargin = (showLabels ? 26 : 20) * scale;
  const leftMargin = 30 * scale;
  const rightMargin = 30 * scale;

  const fretboardWidth = width - leftMargin - rightMargin;
  const fretboardHeight = height - topMargin - bottomMargin;

  const stringCount = 6;
  const fretCount = 5;

  const stringSpacing = fretboardWidth / (stringCount - 1);
  const fretSpacing = fretboardHeight / fretCount;

  // Find lowest fret > 0 to determine starting fret position
  const activeFrets = fingering.filter((f) => f > 0);
  const maxFret = activeFrets.length > 0 ? Math.max(...activeFrets) : 0;
  const minFret = activeFrets.length > 0 ? Math.min(...activeFrets) : 0;
  const baseFret = maxFret > 5 ? minFret : 1;

  // Human-readable aria label
  const ariaLabel = `${name} ${is_barre ? "barre " : ""}chord diagram: Low E to high e frets: ${fingering.join(", ")}`;

  return (
    <div className={`flex flex-col items-center select-none ${className}`} suppressHydrationWarning>
      {showTitle && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="font-bold text-zinc-100 tracking-tight text-sm md:text-base">
            {name}
          </span>
          {is_barre && (
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Barre
            </span>
          )}
        </div>
      )}

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label={ariaLabel}
        role="img"
        className="overflow-visible"
        suppressHydrationWarning
        style={
          {
            "--fretboard-string": "rgb(113 113 122)",
            "--fretboard-fret": "rgb(82 82 91)",
            "--fretboard-nut": "rgb(244 244 245)",
            "--fretboard-dot": dotColor,
          } as React.CSSProperties
        }
      >
        <title>{ariaLabel}</title>

        {/* Starting fret label if higher up the neck */}
        {baseFret > 1 && (
          <text
            x={leftMargin - 10 * scale}
            y={topMargin + fretSpacing / 2 + 4 * scale}
            textAnchor="end"
            fontSize={11 * scale}
            fontWeight="600"
            fill="rgb(161 161 170)"
          >
            {baseFret}fr
          </text>
        )}

        {/* Nut (fret 0 bar) if baseFret == 1 */}
        {baseFret === 1 ? (
          <rect
            x={leftMargin - 1}
            y={topMargin - 4 * scale}
            width={fretboardWidth + 2}
            height={4 * scale}
            rx={1}
            fill="var(--fretboard-nut)"
          />
        ) : (
          <line
            x1={leftMargin}
            y1={topMargin}
            x2={leftMargin + fretboardWidth}
            y2={topMargin}
            stroke="var(--fretboard-fret)"
            strokeWidth={2 * scale}
          />
        )}

        {/* Horizontal frets */}
        {Array.from({ length: fretCount + 1 }).map((_, fIdx) => {
          const y = topMargin + fIdx * fretSpacing;
          return (
            <line
              key={`fret-${fIdx}`}
              x1={leftMargin}
              y1={y}
              x2={leftMargin + fretboardWidth}
              y2={y}
              stroke="var(--fretboard-fret)"
              strokeWidth={1.2 * scale}
            />
          );
        })}

        {/* Vertical strings (6 strings from low E to high e) */}
        {Array.from({ length: stringCount }).map((_, sIdx) => {
          const x = leftMargin + sIdx * stringSpacing;
          // Thicker lines for lower bass strings
          const strokeWidth = (2.2 - sIdx * 0.25) * scale;
          return (
            <line
              key={`string-${sIdx}`}
              x1={x}
              y1={topMargin}
              x2={x}
              y2={topMargin + fretboardHeight}
              stroke="var(--fretboard-string)"
              strokeWidth={strokeWidth}
            />
          );
        })}

        {/* Muted (X) and Open (O) indicators above nut */}
        {fingering.map((fret, sIdx) => {
          const x = leftMargin + sIdx * stringSpacing;
          const y = topMargin - 14 * scale;

          if (fret === -1) {
            // Muted string X
            const s = 4 * scale;
            return (
              <g key={`mute-${sIdx}`} stroke="rgb(239 68 68)" strokeWidth={1.8 * scale}>
                <line x1={x - s} y1={y - s} x2={x + s} y2={y + s} />
                <line x1={x + s} y1={y - s} x2={x - s} y2={y + s} />
              </g>
            );
          }

          if (fret === 0) {
            // Open string O
            return (
              <circle
                key={`open-${sIdx}`}
                cx={x}
                cy={y}
                r={4 * scale}
                fill="none"
                stroke="rgb(52 211 153)"
                strokeWidth={1.8 * scale}
              />
            );
          }

          return null;
        })}

        {/* Finger dots */}
        {fingering.map((fret, sIdx) => {
          if (fret <= 0) return null;

          const relativeFret = baseFret > 1 ? fret - baseFret + 1 : fret;
          if (relativeFret < 1 || relativeFret > fretCount) return null;

          const x = leftMargin + sIdx * stringSpacing;
          const y = topMargin + (relativeFret - 0.5) * fretSpacing;
          const radius = 6.5 * scale;

          return (
            <g key={`dot-${sIdx}`} className="transition-all duration-300 motion-reduce:transition-none">
              <circle
                cx={x}
                cy={y}
                r={radius}
                fill="var(--fretboard-dot)"
                className="drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]"
              />
              <circle
                cx={x - 2 * scale}
                cy={y - 2 * scale}
                r={1.8 * scale}
                fill="rgba(255, 255, 255, 0.4)"
              />
            </g>
          );
        })}

        {/* Fret numbers along the right side */}
        {showLabels &&
          Array.from({ length: fretCount }).map((_, fIdx) => {
            const y = topMargin + (fIdx + 0.5) * fretSpacing + 3.5 * scale;
            const x = leftMargin + fretboardWidth + 8 * scale;
            const fretNumber = baseFret + fIdx;
            return (
              <text
                key={`fret-num-${fIdx}`}
                x={x}
                y={y}
                fill="rgb(161 161 170)"
                fontSize={9.5 * scale}
                fontWeight="600"
                textAnchor="start"
                className="font-mono select-none"
              >
                {fretNumber}
              </text>
            );
          })}

        {/* String names below the fretboard (E, A, D, G, B, E) */}
        {showLabels &&
          STRING_NAMES.map((strName, sIdx) => {
            const x = leftMargin + sIdx * stringSpacing;
            const y = topMargin + fretboardHeight + 16 * scale;
            return (
              <text
                key={`string-name-${sIdx}`}
                x={x}
                y={y}
                fill="rgb(212 212 216)"
                fontSize={10 * scale}
                fontWeight="700"
                textAnchor="middle"
                className="font-sans select-none"
              >
                {strName}
              </text>
            );
          })}
      </svg>
    </div>
  );
}
