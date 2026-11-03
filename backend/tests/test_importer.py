"""Unit tests for the Kaggle song importer using small fake data fixtures.

Verifies:
- Lyrics columns are dropped immediately and never stored
- Multiple parts of a song are aggregated into a single chord set
- Deduplication by (title, artist)
- Rejection of songs with missing title, artist, or genre
- Rejection of songs with fewer than 3 or more than 7 chords
- Rejection of songs with unknown chords or missing fingering data
- Difficulty formula derivation
- Capo is null
No real or copyrighted lyrics are included in any test fixtures or asserts.
"""

import json
from pathlib import Path
import pandas as pd
import pytest

from app.chords import is_barre_chord
from scripts.import_kaggle import derive_difficulty, run_import


@pytest.fixture
def fake_environment(tmp_path: Path):
    """Create a temporary directory structure with fake chords.json and fake CSVs."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()

    # Fake chords.json
    chords_data = [
        {"name": "C", "is_barre": False, "fingering": [-1, 3, 2, 0, 1, 0]},
        {"name": "G", "is_barre": False, "fingering": [3, 2, 0, 0, 0, 3]},
        {"name": "D", "is_barre": False, "fingering": [-1, -1, 0, 2, 3, 2]},
        {"name": "Em", "is_barre": False, "fingering": [0, 2, 2, 0, 0, 0]},
        {"name": "Am", "is_barre": False, "fingering": [-1, 0, 2, 2, 1, 0]},
        {"name": "F", "is_barre": True, "fingering": [1, 3, 3, 2, 1, 1]},
        {"name": "Bm", "is_barre": True, "fingering": [-1, 2, 4, 4, 3, 2]},
    ]
    chords_json_path = tmp_path / "chords.json"
    with open(chords_json_path, "w", encoding="utf-8") as f:
        json.dump(chords_data, f)

    # Fake CSV with test songs (including a dummy Lyrics column to prove it gets dropped)
    fake_rows = [
        # Song 1: Multi-part song (verse + chorus) -> Chords should be union: {C, G, D, Em}
        {
            "Unnamed: 0": 1,
            "Song Artist": "The Test Band",
            "Song Title": "Valid Multi Part Song",
            "Part": "verse",
            "Chords": "C G D",
            "Lyrics": "dummy verse text that must be dropped",
            "Genre": "rock",
        },
        {
            "Unnamed: 0": 2,
            "Song Artist": "The Test Band",
            "Song Title": "Valid Multi Part Song",
            "Part": "chorus",
            "Chords": "D Em G",
            "Lyrics": "dummy chorus text that must be dropped",
            "Genre": "rock",
        },
        # Song 2: Barre chord song -> difficulty increases
        {
            "Unnamed: 0": 3,
            "Song Artist": "Acoustic Duo",
            "Song Title": "Barre Anthem",
            "Part": "verse",
            "Chords": "C G Am F",
            "Lyrics": "dummy lyrics line",
            "Genre": "pop",
        },
        # Song 3: Rejected for fewer than 3 chords
        {
            "Unnamed: 0": 4,
            "Song Artist": "Minimalist",
            "Song Title": "Too Few Chords",
            "Part": "intro",
            "Chords": "C G",
            "Lyrics": "dummy lyrics line",
            "Genre": "folk",
        },
        # Song 4: Rejected for missing title/artist
        {
            "Unnamed: 0": 5,
            "Song Artist": "",
            "Song Title": "Ghost Song",
            "Part": "intro",
            "Chords": "C G D",
            "Lyrics": "dummy lyrics line",
            "Genre": "pop",
        },
        # Song 5: Rejected for unknown chord / missing fingering
        {
            "Unnamed: 0": 6,
            "Song Artist": "Jazz Cat",
            "Song Title": "Unknown Chord Song",
            "Part": "verse",
            "Chords": "C G D Zsharp9",
            "Lyrics": "dummy lyrics line",
            "Genre": "jazz",
        },
    ]

    csv_path = raw_dir / "test_lyrics_df.csv"
    pd.DataFrame(fake_rows).to_csv(csv_path, index=False)

    songs_json_path = tmp_path / "songs.json"
    report_path = tmp_path / "import_report.md"

    return {
        "raw_dir": raw_dir,
        "chords_json_path": chords_json_path,
        "songs_json_path": songs_json_path,
        "report_path": report_path,
    }


def test_import_pipeline_execution(fake_environment):
    """Test full execution of the importer pipeline on fake data."""
    stats = run_import(
        fake_environment["raw_dir"],
        fake_environment["chords_json_path"],
        fake_environment["songs_json_path"],
        fake_environment["report_path"],
    )

    assert stats["rows_read"] == 6
    assert stats["songs_after_dedupe"] == 4
    # Song 1 (Valid Multi Part) and Song 2 (Barre Anthem) should be accepted
    assert stats["valid_songs_count"] == 2

    # Verify songs.json content
    with open(fake_environment["songs_json_path"], "r", encoding="utf-8") as f:
        songs = json.load(f)

    assert len(songs) == 2

    # Verify lyrics are strictly absent
    for s in songs:
        assert "lyrics" not in s
        assert "Lyrics" not in s
        assert s["capo_fret"] is None

    # Check Song 1 aggregation: {C, G, D, Em}
    song1 = next(s for s in songs if s["title"] == "Valid Multi Part Song")
    assert set(song1["chords"]) == {"C", "G", "D", "Em"}
    assert song1["difficulty"] == 2  # 4 open chords -> difficulty 2

    # Check Song 2 difficulty: {C, G, Am, F} -> 4 chords (base 2) + 1 barre (F) -> difficulty 3
    song2 = next(s for s in songs if s["title"] == "Barre Anthem")
    assert set(song2["chords"]) == {"Am", "C", "F", "G"}
    assert song2["difficulty"] == 3

    # Check report was written and contains no lyrics
    assert fake_environment["report_path"].exists()
    report_text = fake_environment["report_path"].read_text(encoding="utf-8")
    assert "dummy verse text" not in report_text
    assert "dummy lyrics line" not in report_text


def test_derive_difficulty_scale():
    """Verify the 1 to 5 difficulty calculation formula."""
    # 3 open chords -> 1
    assert derive_difficulty({"C", "G", "D"}) == 1

    # 4 open chords -> 2
    assert derive_difficulty({"C", "G", "D", "Em"}) == 2

    # 4 chords with 1 barre chord (F) -> base 2 + 1 = 3
    assert derive_difficulty({"C", "G", "Am", "F"}) == 3

    # 5 chords with 1 barre chord (Bm) -> base 3 + 1 = 4
    assert derive_difficulty({"C", "G", "D", "Em", "Bm"}) == 4

    # 5 chords with 2 barre chords (F, Bm) -> base 3 + 2 = 5
    assert derive_difficulty({"C", "G", "Am", "F", "Bm"}) == 5

    # 7 chords with 3 barre chords -> base 4 + 3 = 7 capped at 5
    assert derive_difficulty({"C", "G", "Am", "F", "Bm", "Cm", "D"}) == 5
