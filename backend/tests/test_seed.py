"""Unit tests for the catalog validator and database seeder.

Verifies:
- validate_catalog checks chord uniqueness, fingering length/types, canonical names
- validate_catalog checks song uniqueness, field presence, difficulty (1-5), capo (0-12), chord counts (3-7)
- seed_database operates idempotently into an in-memory SQL database
"""

import pytest
from sqlmodel import Session, create_engine, select
from app.models import Chord, Song, SongChord
from scripts.seed import seed_database, validate_catalog


@pytest.fixture
def valid_test_catalog():
    """Valid small catalog of chords and songs."""
    chords = [
        {"name": "C", "is_barre": False, "fingering": [-1, 3, 2, 0, 1, 0]},
        {"name": "G", "is_barre": False, "fingering": [3, 2, 0, 0, 0, 3]},
        {"name": "D", "is_barre": False, "fingering": [-1, -1, 0, 2, 3, 2]},
        {"name": "Em", "is_barre": False, "fingering": [0, 2, 2, 0, 0, 0]},
    ]
    songs = [
        {
            "title": "Acoustic Sun",
            "artist": "Folk Band",
            "genre": "folk",
            "difficulty": 1,
            "capo_fret": None,
            "chords": ["C", "G", "D"],
        },
        {
            "title": "Evening Strum",
            "artist": "Solo Artist",
            "genre": "pop",
            "difficulty": 2,
            "capo_fret": 2,
            "chords": ["C", "G", "D", "Em"],
        },
    ]
    return chords, songs


def test_validator_passes_on_valid_catalog(valid_test_catalog):
    """Verify that a well-formed catalog produces zero validation errors."""
    chords, songs = valid_test_catalog
    errors = validate_catalog(chords, songs)
    assert errors == []


def test_validator_catches_duplicate_chords():
    """Verify detection of duplicate chord entries."""
    chords = [
        {"name": "C", "is_barre": False, "fingering": [-1, 3, 2, 0, 1, 0]},
        {"name": "C", "is_barre": False, "fingering": [-1, 3, 2, 0, 1, 0]},
    ]
    songs = []
    errors = validate_catalog(chords, songs)
    assert any("duplicate definition" in e for e in errors)


def test_validator_catches_invalid_fingering():
    """Verify detection of invalid fingering lists."""
    chords = [
        {"name": "C", "is_barre": False, "fingering": [3, 2, 0, 1, 0]},  # 5 strings instead of 6
        {"name": "G", "is_barre": False, "fingering": [-5, 2, 0, 0, 0, 3]},  # fret -5 is invalid
    ]
    songs = []
    errors = validate_catalog(chords, songs)
    assert any("must be a list of 6 integers" in e for e in errors)
    assert any("invalid fret" in e for e in errors)


def test_validator_catches_duplicate_song(valid_test_catalog):
    """Verify detection of duplicate (title, artist) entries."""
    chords, songs = valid_test_catalog
    dup_songs = songs + [songs[0]]  # Add duplicate of song 0
    errors = validate_catalog(chords, dup_songs)
    assert any("duplicate (title, artist)" in e for e in errors)


def test_validator_catches_invalid_difficulty(valid_test_catalog):
    """Verify detection of difficulty values outside [1, 5]."""
    chords, songs = valid_test_catalog
    bad_songs = [
        {
            "title": "Broken Diff",
            "artist": "Artist",
            "genre": "rock",
            "difficulty": 6,  # Invalid
            "capo_fret": None,
            "chords": ["C", "G", "D"],
        }
    ]
    errors = validate_catalog(chords, bad_songs)
    assert any("difficulty must be integer between 1 and 5" in e for e in errors)


def test_validator_catches_invalid_capo(valid_test_catalog):
    """Verify detection of capo values outside [0, 12]."""
    chords, songs = valid_test_catalog
    bad_songs = [
        {
            "title": "High Capo",
            "artist": "Artist",
            "genre": "rock",
            "difficulty": 2,
            "capo_fret": 15,  # Invalid capo
            "chords": ["C", "G", "D"],
        }
    ]
    errors = validate_catalog(chords, bad_songs)
    assert any("capo_fret must be null or 0 to 12" in e for e in errors)


def test_validator_catches_invalid_chord_counts(valid_test_catalog):
    """Verify rejection of songs with < 3 or > 7 chords."""
    chords, _ = valid_test_catalog
    bad_songs = [
        {
            "title": "Two Chords",
            "artist": "Artist",
            "genre": "folk",
            "difficulty": 1,
            "capo_fret": None,
            "chords": ["C", "G"],  # Fewer than 3
        }
    ]
    errors = validate_catalog(chords, bad_songs)
    assert any("must have at least 3 chords" in e for e in errors)


def test_validator_catches_chord_missing_fingering(valid_test_catalog):
    """Verify rejection of song requiring a chord with no fingering data in chords.json."""
    chords, _ = valid_test_catalog  # chords contains C, G, D, Em
    bad_songs = [
        {
            "title": "F Chord Missing",
            "artist": "Artist",
            "genre": "rock",
            "difficulty": 3,
            "capo_fret": None,
            "chords": ["C", "G", "F"],  # F is canonical but not in chords fixture
        }
    ]
    errors = validate_catalog(chords, bad_songs)
    assert any("has no fingering data in chords.json" in e for e in errors)


def test_idempotent_database_seeding(valid_test_catalog):
    """Verify seed_database inserts records and is safe to execute multiple times."""
    chords, songs = valid_test_catalog
    # In-memory SQLite for testing
    test_db_url = "sqlite:///:memory:"

    # First seeding pass
    stats1 = seed_database(test_db_url, chords, songs)
    assert stats1["chords_total"] == 4
    assert stats1["songs_inserted"] == 2
    assert stats1["songs_updated"] == 0

    # Create engine pointing to the same file or verify in-memory logic
    # Test idempotence on a persistent SQLite file
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    file_db_url = f"sqlite:///{db_path}"
    try:
        # Pass 1
        run1 = seed_database(file_db_url, chords, songs)
        assert run1["songs_inserted"] == 2

        # Pass 2 (exact same input) -> should update 2, insert 0
        run2 = seed_database(file_db_url, chords, songs)
        assert run2["songs_inserted"] == 0
        assert run2["songs_updated"] == 2

        # Verify DB content
        engine = create_engine(file_db_url)
        try:
            with Session(engine) as session:
                db_songs = session.exec(select(Song)).all()
                assert len(db_songs) == 2
                db_chords = session.exec(select(Chord)).all()
                assert len(db_chords) == 4

                # Verify relationships
                song = session.exec(select(Song).where(Song.title == "Acoustic Sun")).first()
                assert len(song.chords) == 3
        finally:
            engine.dispose()
    finally:
        import os
        if os.path.exists(db_path):
            os.remove(db_path)
