"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { SongSheet, SongSheetPart } from "@/lib/types";
import { Fretboard } from "@/components/Fretboard";
import ChordlyLogo from "@/components/ChordlyLogo";
import { getStoredPracticeList, toggleFavoriteSong } from "@/lib/localStorage";

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Beginner",
  2: "Easy",
  3: "Intermediate",
  4: "Advanced",
  5: "Expert",
};

const DIFFICULTY_COLORS: Record<number, string> = {
  1: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  2: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  3: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  4: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  5: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function buildLyricLines(
  parts: SongSheetPart[]
): Array<{ type: "section"; label: string } | { type: "line"; chords: string[]; lyrics: string }> {
  const result: Array<
    { type: "section"; label: string } | { type: "line"; chords: string[]; lyrics: string }
  > = [];

  for (const part of parts) {
    if (part.part) {
      result.push({ type: "section", label: part.part });
    }

    if (!part.lyrics.trim() && part.chords.length === 0) continue;

    const rawLines = part.lyrics
      .split(/\s{2,}|\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (rawLines.length === 0 && part.chords.length > 0) {
      result.push({ type: "line", chords: part.chords, lyrics: "" });
      continue;
    }

    const chordsPerLine = Math.ceil(part.chords.length / Math.max(rawLines.length, 1));
    rawLines.forEach((line, idx) => {
      const start = idx * chordsPerLine;
      const end = start + chordsPerLine;
      const lineChords = part.chords.slice(start, end);
      result.push({ type: "line", chords: lineChords, lyrics: line });
    });
  }

  return result;
}

export default function SongDetailPage() {
  const params = useParams();
  const songId = Number(params.id);

  const [sheet, setSheet] = useState<SongSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChord, setSelectedChord] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [fontSize, setFontSize] = useState(14);

  useEffect(() => {
    if (!songId) return;
    api
      .getSongSheet(songId)
      .then((data) => {
        setSheet(data);
        if (data.song.chords.length > 0) setSelectedChord(data.song.chords[0]);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [songId]);

  useEffect(() => {
    const list = getStoredPracticeList();
    setIsFavorite(list.favorites.includes(songId));
  }, [songId]);

  const handleToggleFavorite = () => {
    const updated = toggleFavoriteSong(songId);
    setIsFavorite(updated.favorites.includes(songId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 text-sm">Loading song sheet...</span>
        </div>
      </div>
    );
  }

  if (error || !sheet) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-rose-400 text-sm">{error || "Song not found"}</p>
          <Link href="/app" className="text-amber-400 hover:underline text-xs">
            Back to workspace
          </Link>
        </div>
      </div>
    );
  }

  const { song, parts } = sheet;
  const displayLines = buildLyricLines(parts);
  const youtubeQuery = encodeURIComponent(`${song.title} ${song.artist} guitar lesson`);
  const youtubeUrl = `https://www.youtube.com/results?search_query=${youtubeQuery}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-40 bg-zinc-950/85 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-8 py-3.5 flex items-center gap-4">
        <Link
          href="/app"
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 transition-colors text-xs font-semibold"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>
        <div className="h-4 w-px bg-zinc-800" />
        <Link href="/" className="flex items-center gap-2.5 group">
          <ChordlyLogo size={28} />
          <span className="font-black text-sm tracking-tight text-zinc-100 group-hover:text-amber-400 transition-colors">
            Chordly
          </span>
        </Link>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 sm:space-y-12">
        {/* Song Header */}
        <section>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100 mb-1.5">
            {song.title}
          </h1>
          <p className="text-zinc-400 text-sm mb-4 font-medium">{song.artist}</p>

          <div className="flex flex-wrap items-center gap-2.5 mb-6">
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800">
              {song.genre}
            </span>
            <span className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${DIFFICULTY_COLORS[song.difficulty] || "bg-zinc-900 text-zinc-300 border-zinc-800"}`}>
              {DIFFICULTY_LABELS[song.difficulty]?.toUpperCase() ?? `DIFFICULTY ${song.difficulty}`}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800">
              {song.chords.length} CHORDS
            </span>
            {song.capo_fret != null && (
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/25">
                CAPO {song.capo_fret}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleToggleFavorite}
              className="flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-all shadow-md shadow-amber-500/10"
            >
              <span className="text-sm">★</span>
              <span>{isFavorite ? "Saved to favorites" : "Save to favorites"}</span>
            </button>

            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-850 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5 fill-current text-rose-500" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              Watch Tutorial
            </a>
          </div>
        </section>

        {/* How to Play It */}
        <section>
          <div className="mb-5">
            <h2 className="text-2xl font-bold text-zinc-100 tracking-tight mb-1">How to play it</h2>
            <p className="text-xs text-zinc-400">
              Fingering diagrams for the shapes in this song. × = don&apos;t play, O = open string.
            </p>
            <div className="mt-4 h-px bg-zinc-800/80" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {song.chords.map((chordName) => (
              <div
                key={chordName}
                onClick={() => setSelectedChord(chordName)}
                className={`bg-zinc-900/70 border rounded-2xl p-4 flex flex-col items-center justify-between min-h-[180px] sm:min-h-[220px] transition-all cursor-pointer ${
                  selectedChord === chordName
                    ? "border-amber-500/80 bg-zinc-900 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10"
                    : "border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900"
                }`}
              >
                <div
                  className={`font-bold text-sm tracking-wide mb-1 transition-colors ${
                    selectedChord === chordName ? "text-amber-400" : "text-zinc-100"
                  }`}
                >
                  {chordName}
                </div>
                <div className="flex-1 flex items-center justify-center w-full">
                  <Fretboard
                    chordName={chordName}
                    size="sm"
                    showTitle={false}
                    showLabels={false}
                    dotColor="rgb(52 211 153)"
                  />
                </div>
              </div>
            ))}
          </div>

          {selectedChord && (
            <div className="mt-6 p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col sm:flex-row items-center gap-6">
              <Fretboard
                chordName={selectedChord}
                size="lg"
                showTitle={true}
                showLabels={true}
                dotColor="rgb(52 211 153)"
              />
              <div className="flex-1">
                <div className="text-3xl font-black text-amber-400 mb-1.5">{selectedChord}</div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Full fingering diagram with labeled string names{" "}
                  <span className="whitespace-nowrap">(E A D G B E)</span> and numbered frets.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Chords and Lyrics Sheet */}
        {displayLines.length > 0 && (
          <section>
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-zinc-100 tracking-tight mb-1">Chords &amp; lyrics</h2>
              <p className="text-xs text-zinc-400">
                Chord names sit directly above the word where you change.
              </p>
              <div className="mt-4 h-px bg-zinc-800/80" />
            </div>

            <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800/80 p-6 sm:p-8 overflow-hidden shadow-xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-800/80">
                <span className="text-xs font-semibold text-zinc-400">Text size</span>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.max(11, s - 1))}
                  className="text-xs font-bold text-zinc-300 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 transition-colors"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.min(24, s + 1))}
                  className="text-xs font-bold text-zinc-300 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 transition-colors"
                >
                  A+
                </button>
              </div>

              <div className="overflow-x-auto">
                <div
                  className="font-mono"
                  style={{ fontSize: `${fontSize}px`, lineHeight: "2.0" }}
                >
                  {displayLines.map((item, idx) => {
                    if (item.type === "section") {
                      return (
                        <div key={idx} className="mt-8 mb-3">
                          <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400">
                            {item.label}
                          </span>
                        </div>
                      );
                    }

                    const { chords, lyrics } = item;

                    if (!lyrics && chords.length > 0) {
                      return (
                        <div key={idx} className="mb-2">
                          <div
                            className="text-amber-400 font-bold tracking-wide"
                            style={{ fontSize: `${Math.max(10, fontSize - 1)}px` }}
                          >
                            {chords.join("   ")}
                          </div>
                        </div>
                      );
                    }

                    const words = lyrics.split(" ");
                    const chordPositions: Array<{ offset: number; chord: string }> = [];
                    let charOffset = 0;
                    words.forEach((word, wi) => {
                      if (wi < chords.length) {
                        chordPositions.push({ offset: charOffset, chord: chords[wi] });
                      }
                      charOffset += word.length + 1;
                    });

                    let chordLine = "";
                    let cursor = 0;
                    for (const { offset, chord } of chordPositions) {
                      if (offset > cursor) {
                        chordLine += " ".repeat(offset - cursor);
                      }
                      chordLine += chord;
                      cursor = Math.max(cursor, offset + chord.length);
                    }

                    return (
                      <div key={idx} className="mb-2">
                        {chordLine.trim() && (
                          <div
                            className="text-amber-400 font-bold whitespace-pre"
                            style={{ fontSize: `${Math.max(10, fontSize - 1)}px` }}
                          >
                            {chordLine}
                          </div>
                        )}
                        <div className="text-zinc-200 whitespace-pre-wrap">{lyrics}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {displayLines.length === 0 && (
          <section>
            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
              <p className="text-zinc-500 text-sm">No chord sheet available for this song.</p>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950/80 py-6 px-4 text-center text-xs text-zinc-500">
        Chordly
      </footer>
    </div>
  );
}
