"use client";

import React from "react";
import { PROGRESSION_PRESETS, ProgressionPreset } from "../lib/chords";

interface ProgressionPresetsProps {
  onSelectPreset: (chords: string[]) => void;
  selectedChords: string[];
}

export function ProgressionPresets({
  onSelectPreset,
  selectedChords,
}: ProgressionPresetsProps) {
  return (
    <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
          Progression Presets
        </h3>
        <span className="text-xs text-zinc-400">Tap to load a progression</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {PROGRESSION_PRESETS.map((preset: ProgressionPreset) => {
          const isActive = selectedChords.length === preset.chords.length
            && preset.chords.every((chord, index) => selectedChords[index] === chord);

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.chords)}
              aria-pressed={isActive}
              aria-describedby={`preset-description-${preset.id}`}
              className={`progression-preset flex flex-col text-left p-3 rounded-xl border transition-colors text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                isActive
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                  : "bg-zinc-800/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800/80 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-bold text-sm tracking-tight text-zinc-100">
                  {preset.name}
                </span>
                {isActive && (
                  <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                    Active
                  </span>
                )}
              </div>
              <p aria-hidden="true" className="text-[11px] text-zinc-400 leading-snug line-clamp-1">
                {preset.description}
              </p>
              <span id={`preset-description-${preset.id}`} role="tooltip" className="progression-preset-description">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
