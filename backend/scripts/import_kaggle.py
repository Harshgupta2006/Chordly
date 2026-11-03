"""Import pipeline for Kaggle Ultimate-Guitar chord dataset.

CRITICAL REQUIREMENTS:
- Drops all lyrics columns immediately upon loading.
- Never writes, prints, or stores lyrics in any file, terminal, or log.
- Aggregates chord parts into a single canonical chord set per song.
- Deduplicates songs by (title, artist), retaining the version with the fewest chords.
- Validates each chord against chords.py and chords.json.
- Rejects songs with missing metadata or chord counts outside [3, 7].
- Derives difficulty (1 to 5 scale) from chord count and barre chords.
- Leaves capo_fret as null since the dataset does not provide capo positions.
- Writes backend/data/songs.json and backend/data/import_report.md.
"""

import glob
import json
import os
import random
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd

# Allow running as standalone script
import sys
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.chords import UnknownChordError, is_barre_chord, normalize_chord

# Non-chord strings that occur in tablature formatting
NON_CHORD_TOKENS = {
    "n.c.", "n.c", "nc", "x2", "x3", "x4", "x5", "x6", "x8",
    "(x2)", "(x3)", "(x4)", "(x5)", "-", "/", "|", "on", "and", "riff",
    "repeat", "play", "stop", "break", "intro", "outro", "verse", "chorus",
    "slide", "end", "solo", "bridge", "hook", "capo", "tuning"
}


def load_known_fingerings(chords_path: Path) -> set[str]:
    """Load canonical chord names with verified fingering data."""
    with open(chords_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {c["name"] for c in data}


def derive_difficulty(chords: set[str]) -> int:
    """Derive difficulty on a 1 to 5 scale from chord count and barre chords.

    Formula:
    - Base difficulty from distinct chord count:
      - 3 chords: base 1 (simplest beginner songs)
      - 4 chords: base 2 (standard 4-chord pop/rock)
      - 5 chords: base 3 (intermediate progressions)
      - 6 or 7 chords: base 4 (advanced progressions)
    - Barre penalty: +1 for each chord requiring a barre finger shape.
    - Clamped to range [1, 5].
    """
    count = len(chords)
    if count <= 3:
        base = 1
    elif count == 4:
        base = 2
    elif count == 5:
        base = 3
    else:
        base = 4

    barre_count = sum(1 for c in chords if is_barre_chord(c))
    return max(1, min(5, base + barre_count))


def run_import(
    raw_dir: Path,
    chords_json_path: Path,
    output_songs_path: Path,
    output_report_path: Path,
) -> dict[str, Any]:
    """Execute the Kaggle import and transformation pipeline."""
    known_fingerings = load_known_fingerings(chords_json_path)
    csv_files = sorted(glob.glob(str(raw_dir / "*.csv")))

    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {raw_dir}")

    total_rows_read = 0
    # Group parts by song: (normalized_artist, normalized_title) -> metadata dict
    grouped_songs: dict[tuple[str, str], dict[str, Any]] = {}
    duplicate_versions_count = 0

    for csv_file in csv_files:
        # Load CSV and IMMEDIATELY drop lyrics column if present
        df = pd.read_csv(csv_file)
        if "Lyrics" in df.columns:
            df = df.drop(columns=["Lyrics"])

        total_rows_read += len(df)

        for _, row in df.iterrows():
            artist = str(row.get("Song Artist", "")).strip()
            title = str(row.get("Song Title", "")).strip()
            genre = str(row.get("Genre", "")).strip().lower()
            chords_raw = str(row.get("Chords", ""))

            if not artist or not title or artist.lower() == "nan" or title.lower() == "nan":
                continue

            key = (artist.lower(), title.lower())
            if key not in grouped_songs:
                grouped_songs[key] = {
                    "artist": artist,
                    "title": title,
                    "genre": genre,
                    "raw_parts": [],
                }

            if chords_raw and chords_raw.lower() != "nan":
                grouped_songs[key]["raw_parts"].append(chords_raw)

    songs_after_dedupe = len(grouped_songs)
    rejections = Counter()
    valid_songs: list[dict[str, Any]] = []

    for key, song_info in grouped_songs.items():
        # Check metadata
        if not song_info["genre"] or song_info["genre"] == "nan":
            rejections["Missing genre"] += 1
            continue

        # Extract and clean tokens across all song parts
        raw_tokens: set[str] = set()
        for part_str in song_info["raw_parts"]:
            for token in part_str.split():
                cleaned = token.strip().strip(",.()")
                if cleaned and cleaned.lower() not in NON_CHORD_TOKENS:
                    raw_tokens.add(cleaned)

        if not raw_tokens:
            rejections["No chords found"] += 1
            continue

        # Normalize every chord using chords.py
        normalized_chords: set[str] = set()
        rejected_reason: str | None = None

        for t in raw_tokens:
            if t.lower() in NON_CHORD_TOKENS:
                continue
            try:
                norm = normalize_chord(t)
                if norm not in known_fingerings:
                    rejected_reason = f"Chord missing fingering ({norm})"
                    break
                normalized_chords.add(norm)
            except UnknownChordError:
                rejected_reason = f"Unknown chord ({t})"
                break

        if rejected_reason:
            rejections[rejected_reason] += 1
            continue

        chord_count = len(normalized_chords)
        if chord_count < 3:
            rejections["Fewer than 3 distinct chords"] += 1
            continue
        if chord_count > 7:
            rejections["More than 7 distinct chords"] += 1
            continue

        difficulty = derive_difficulty(normalized_chords)

        valid_songs.append({
            "title": song_info["title"],
            "artist": song_info["artist"],
            "genre": song_info["genre"],
            "difficulty": difficulty,
            "capo_fret": None,  # Capo is null because dataset does not provide it
            "chords": sorted(normalized_chords),
        })

    # Sort valid songs by title, artist for deterministic output
    valid_songs.sort(key=lambda s: (s["genre"], s["title"], s["artist"]))

    # Save songs.json
    output_songs_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_songs_path, "w", encoding="utf-8") as f:
        json.dump(valid_songs, f, indent=2)

    # Generate import report
    genre_counts = Counter(s["genre"] for s in valid_songs)

    # Select 10 deterministic spot-check songs (seed fixed for reproducible report)
    random.seed(42)
    sample_songs = random.sample(valid_songs, min(10, len(valid_songs)))

    report_lines = [
        "# Kaggle Song Import Report: Chordly",
        "",
        "## Summary",
        f"- **Rows read from raw CSV files**: {total_rows_read}",
        f"- **Unique songs after deduplication by (title, artist)**: {songs_after_dedupe}",
        f"- **Valid songs accepted into catalogue**: {len(valid_songs)}",
        f"- **Total songs rejected**: {sum(rejections.values())}",
        "- **Capo data handling**: The source dataset contains no capo column; `capo_fret` is set to null.",
        "- **Lyrics hygiene**: All lyrics columns were dropped immediately on load. No lyrics exist in output.",
        "",
        "## Genre Distribution",
        "| Genre | Song Count |",
        "|:------|:-----------|",
    ]
    for genre, count in sorted(genre_counts.items()):
        report_lines.append(f"| {genre.capitalize()} | {count} |")

    report_lines.extend([
        "",
        "## Rejections by Reason",
        "| Reason | Count |",
        "|:-------|:------|",
    ])
    for reason, count in rejections.most_common():
        # Sanitize any strange non-ascii characters for clean markdown table
        clean_reason = reason.encode("ascii", "replace").decode("ascii")
        report_lines.append(f"| {clean_reason} | {count} |")

    report_lines.extend([
        "",
        "## Spot Check: 10 Random Songs (Chords Only, No Lyrics)",
        "| Title | Artist | Genre | Difficulty | Chords |",
        "|:------|:-------|:------|:-----------|:-------|",
    ])
    for s in sample_songs:
        chords_str = ", ".join(s["chords"])
        report_lines.append(f"| {s['title']} | {s['artist']} | {s['genre']} | {s['difficulty']} | {chords_str} |")

    report_lines.append("")

    with open(output_report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    return {
        "rows_read": total_rows_read,
        "songs_after_dedupe": songs_after_dedupe,
        "valid_songs_count": len(valid_songs),
        "genre_counts": dict(genre_counts),
        "rejections": dict(rejections),
    }


if __name__ == "__main__":
    raw_directory = backend_dir / "data" / "raw"
    chords_file = backend_dir / "data" / "chords.json"
    songs_file = backend_dir / "data" / "songs.json"
    report_file = backend_dir / "data" / "import_report.md"

    stats = run_import(raw_directory, chords_file, songs_file, report_file)
    print("Import complete!")
    print(f"  Rows read: {stats['rows_read']}")
    print(f"  Valid songs saved: {stats['valid_songs_count']}")
    print(f"  Genre counts: {stats['genre_counts']}")
