"use client";

import React from "react";
import Link from "next/link";
import { Song } from "../lib/types";

interface SongCardProps {
  song: Song;
  missingChords?: string[];
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  onSelectChordPreview: (chordName: string) => void;
}

export function SongCard({
  song,
  missingChords = [],
  isFavorite,
  onToggleFavorite,
  onSelectChordPreview,
}: SongCardProps) {
  const missingSet = new Set(missingChords);

  // Safe YouTube search URL without lyrics
  const youtubeQuery = encodeURIComponent(`${song.title} ${song.artist} guitar lesson`);
  const youtubeUrl = `https://www.youtube.com/results?search_query=${youtubeQuery}`;

  // Difficulty badge labels & styling
  const difficultyLabels: Record<number, string> = {
    1: "Beginner",
    2: "Easy",
    3: "Intermediate",
    4: "Advanced",
    5: "Expert",
  };

  const difficultyColors: Record<number, string> = {
    1: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    2: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    3: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    4: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    5: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };

  return (
    <div className="group relative bg-zinc-900/70 backdrop-blur-md rounded-2xl border border-zinc-800/80 p-4 hover:border-zinc-700/80 hover:shadow-xl hover:shadow-black/40 transition-all flex flex-col justify-between">
      {/* Top row: Genre, Difficulty, Capo, Favorite */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/50">
              {song.genre}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                difficultyColors[song.difficulty] || "bg-zinc-800 text-zinc-400"
              }`}
            >
              {difficultyLabels[song.difficulty] || `Level ${song.difficulty}`}
            </span>
            {song.capo_fret !== null && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Capo {song.capo_fret}
              </span>
            )}
          </div>

          {/* Favorite Toggle Button */}
          <button
            type="button"
            onClick={() => onToggleFavorite(song.id)}
            className="text-zinc-500 hover:text-rose-400 focus:outline-none focus:ring-2 focus:ring-amber-500 rounded-full p-1 transition-colors"
            aria-label={isFavorite ? `Remove ${song.title} from favorites` : `Add ${song.title} to favorites`}
          >
            <svg
              className={`w-5 h-5 transition-transform active:scale-125 ${
                isFavorite ? "fill-rose-500 text-rose-500" : "fill-none stroke-current"
              }`}
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
          </button>
        </div>

        {/* Title and Artist */}
        <Link href={`/app/song/${song.id}`} className="block group/link">
          <h3 className="font-extrabold text-base text-zinc-100 group-hover/link:text-amber-400 transition-colors line-clamp-1">
            {song.title}
          </h3>
          <p className="text-xs font-medium text-zinc-400 mb-3 line-clamp-1">
            {song.artist}
          </p>
        </Link>
      </div>

      {/* Chords Required List */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
          <span>{song.chords.length} chords</span>
          {missingChords.length > 0 && (
            <span className="text-amber-400 font-semibold">
              Needs {missingChords.length} more
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3.5">
          {song.chords.map((chordName) => {
            const isMissing = missingSet.has(chordName);
            return (
              <button
                key={`${song.id}-${chordName}`}
                type="button"
                onClick={() => onSelectChordPreview(chordName)}
                title={`Click to view ${chordName} chord diagram`}
                className={`text-xs font-bold px-2 py-0.5 rounded-md border transition-all ${
                  isMissing
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30 animate-pulse"
                    : "bg-zinc-800/90 text-zinc-300 border-zinc-700/60 hover:bg-zinc-700 hover:text-zinc-100"
                }`}
              >
                {chordName}
              </button>
            );
          })}
        </div>

        {/* Action Button: Learn this song (YouTube) */}
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-full gap-2 px-3 py-2 text-xs font-bold rounded-xl bg-zinc-800 text-zinc-200 hover:bg-amber-500 hover:text-zinc-950 transition-all border border-zinc-700/60 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          Learn This Song
        </a>
      </div>
    </div>
  );
}
