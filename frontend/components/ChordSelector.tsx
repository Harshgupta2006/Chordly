"use client";

import React from "react";
import { CHORD_GROUPS, QUICK_PICK_CHORDS } from "../lib/chords";

interface ChordSelectorProps {
  selectedChords: string[];
  onToggleChord: (chord: string) => void;
  onClearAll: () => void;
  onSelectChords: (chords: string[]) => void;
  previewChord: string | null;
  onPreviewChord: (chord: string | null) => void;
}

export function ChordSelector({
  selectedChords,
  onToggleChord,
  onClearAll,
  onSelectChords,
  previewChord,
  onPreviewChord,
}: ChordSelectorProps) {
  const selectedSet = new Set(selectedChords);

  const handleKeyDown = (e: React.KeyboardEvent, chord: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggleChord(chord);
    }
  };

  return (
    <div className="bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-zinc-800 p-4 sm:p-5 shadow-xl">
      {/* Header with counter and clear */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">Your Known Chords</h2>
          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {selectedChords.length} selected
          </span>
        </div>

        {selectedChords.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors px-2.5 py-1 rounded-lg hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            aria-label="Clear all selected chords"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Quick-Pick Section */}
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Quick Pick (First Chords)
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_PICK_CHORDS.map((chord) => {
            const isSelected = selectedSet.has(chord);
            const isPreviewed = previewChord === chord;
            return (
              <button
                key={`quick-${chord}`}
                type="button"
                onClick={() => onToggleChord(chord)}
                onMouseEnter={() => onPreviewChord(chord)}
                onFocus={() => onPreviewChord(chord)}
                onKeyDown={(e) => handleKeyDown(e, chord)}
                aria-pressed={isSelected}
                className={`px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  isSelected
                    ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20 scale-[1.02]"
                    : "bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700/80 hover:text-zinc-100 border border-zinc-700/50"
                } ${isPreviewed ? "ring-2 ring-amber-400/50" : ""}`}
              >
                {chord}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grouped Chord Grid */}
      <div className="space-y-4">
        {CHORD_GROUPS.map((group) => (
          <div key={group.id} className="pt-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              {group.label}
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 gap-1.5">
              {group.chords.map((chord) => {
                const isSelected = selectedSet.has(chord);
                const isPreviewed = previewChord === chord;
                return (
                  <button
                    key={chord}
                    type="button"
                    onClick={() => onToggleChord(chord)}
                    onMouseEnter={() => onPreviewChord(chord)}
                    onFocus={() => onPreviewChord(chord)}
                    onKeyDown={(e) => handleKeyDown(e, chord)}
                    aria-pressed={isSelected}
                    className={`py-2 px-1 rounded-xl text-center font-semibold text-xs transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                      isSelected
                        ? "bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20"
                        : "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/70 hover:text-zinc-100 border border-zinc-800"
                    } ${isPreviewed ? "ring-2 ring-amber-400/50" : ""}`}
                  >
                    {chord}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
