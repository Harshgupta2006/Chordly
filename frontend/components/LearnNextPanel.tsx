"use client";

import React from "react";
import { NextChordRecommendation } from "../lib/types";

interface LearnNextPanelProps {
  recommendations: NextChordRecommendation[];
  onAddChord: (chord: string) => void;
  onPreviewChord: (chord: string) => void;
  loading: boolean;
}

export function LearnNextPanel({
  recommendations,
  onAddChord,
  onPreviewChord,
  loading,
}: LearnNextPanelProps) {
  if (loading) {
    return (
      <div className="bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-zinc-800/80 p-5 shadow-lg animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="h-28 bg-zinc-800/50 rounded-xl"></div>
          <div className="h-28 bg-zinc-800/50 rounded-xl"></div>
          <div className="h-28 bg-zinc-800/50 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-amber-500/10 via-zinc-900/80 to-zinc-900/90 backdrop-blur-md rounded-2xl border border-amber-500/20 p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <h2 className="text-base font-extrabold text-zinc-100 tracking-tight">
              Best Chords to Learn Next
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Ranked by how many new songs you unlock by mastering just one more shape.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {recommendations.map((rec, index) => {
          const rankLabel = index === 0 ? "Top Pick" : index === 1 ? "#2 Choice" : "#3 Choice";
          return (
            <div
              key={rec.chord}
              className="relative flex flex-col justify-between p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/50 transition-all shadow-md group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    {rankLabel}
                  </span>
                  {rec.is_barre && (
                    <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                      Barre
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-2 mb-1.5">
                  <button
                    type="button"
                    onClick={() => onPreviewChord(rec.chord)}
                    title={`Preview ${rec.chord} diagram`}
                    className="text-2xl font-black text-zinc-100 hover:text-amber-400 transition-colors"
                  >
                    {rec.chord}
                  </button>
                  <span className="text-sm font-bold text-amber-400">
                    +{rec.unlock_count} {rec.unlock_count === 1 ? "song" : "songs"}
                  </span>
                </div>

                {rec.unlocked_songs.length > 0 && (
                  <p className="text-[11px] text-zinc-400 line-clamp-2 mb-3">
                    Unlocks:{" "}
                    <span className="text-zinc-300">
                      {rec.unlocked_songs.slice(0, 3).join(", ")}
                      {rec.unlocked_songs.length > 3 && ` +${rec.unlocked_songs.length - 3} more`}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => onPreviewChord(rec.chord)}
                  className="flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-center"
                >
                  View Shape
                </button>
                <button
                  type="button"
                  onClick={() => onAddChord(rec.chord)}
                  className="flex-1 py-1.5 px-2 text-xs font-bold rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors text-center shadow-sm"
                >
                  I Know This
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
