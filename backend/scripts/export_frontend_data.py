import json
import csv
import glob
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
DATA_DIR = BASE_DIR / "data"
FRONTEND_DATA_DIR = BASE_DIR.parent / "frontend" / "data"

NON_CHORD_TOKENS = {
    "n.c.", "nc", "none", "no", "x", "intro", "verse", "chorus", "outro",
    "x2", "x3", "x4", "2x", "3x", "4x", "tab", "riff", "solo", "bridge",
    "slide", "end", "hook", "capo", "tuning"
}

def lookup_song_sheet(title: str, artist: str):
    title_lower = title.lower()
    artist_lower = artist.lower()
    csv_files = sorted(glob.glob(str(RAW_DIR / "*.csv")))
    for csv_path in csv_files:
        try:
            with open(csv_path, encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                parts = []
                for row in reader:
                    row_title = str(row.get("Song Title", "")).strip().lower()
                    row_artist = str(row.get("Song Artist", "")).strip().lower()
                    if row_title != title_lower or row_artist != artist_lower:
                        continue
                    raw_chords = str(row.get("Chords", ""))
                    chord_list = [
                        token.strip().strip(",.()").upper() if token.strip().strip(",.()").upper() in (
                            token.strip().strip(",.()"),
                        ) else token.strip().strip(",.()")
                        for token in raw_chords.split()
                        if token.strip().strip(",.()").lower() not in NON_CHORD_TOKENS
                        and token.strip().strip(",.()")
                    ]
                    deduped = []
                    for ch in chord_list:
                        if not deduped or deduped[-1] != ch:
                            deduped.append(ch)
                    lyrics_text = str(row.get("Lyrics", "")).strip()
                    part_label = str(row.get("Part", "")).strip()
                    if part_label or deduped or lyrics_text:
                        parts.append({
                            "part": part_label,
                            "chords": deduped,
                            "lyrics": lyrics_text,
                        })
                if parts:
                    return parts
        except Exception:
            continue
    return []

def main():
    with open(DATA_DIR / "songs.json", encoding="utf-8") as f:
        songs = json.load(f)

    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)

    enriched_songs = []
    sheets = {}

    for idx, s in enumerate(songs, start=1):
        s_copy = dict(s)
        s_copy["id"] = idx
        enriched_songs.append(s_copy)

        parts = lookup_song_sheet(s["title"], s["artist"])
        if parts:
            sheets[str(idx)] = parts

    with open(FRONTEND_DATA_DIR / "songs.json", "w", encoding="utf-8") as f:
        json.dump(enriched_songs, f, indent=2)

    with open(FRONTEND_DATA_DIR / "sheets.json", "w", encoding="utf-8") as f:
        json.dump(sheets, f, indent=2)

    print(f"Exported {len(enriched_songs)} songs and {len(sheets)} sheets to frontend/data/")

if __name__ == "__main__":
    main()
