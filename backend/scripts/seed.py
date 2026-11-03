"""Database seeder and validator for Chordly.

Validates chords.json and songs.json against all business and data integrity rules
BEFORE attempting database operations. If any validation rule fails, prints all
issues and exits with non-zero exit code.

Uses the admin database credential (DATABASE_URL) for migrations and seeding.
Operations are idempotent (safe to run multiple times).
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from sqlalchemy.exc import OperationalError
from sqlmodel import Session, SQLModel, create_engine, select

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.chords import CANONICAL_CHORDS, normalize_chord
from app.models import Chord, Song, SongChord


def validate_catalog(
    chords_data: list[dict[str, Any]],
    songs_data: list[dict[str, Any]],
) -> list[str]:
    """Validate chord and song definitions. Returns a list of error strings."""
    errors: list[str] = []

    # 1. Validate chords.json
    chord_names_seen: set[str] = set()
    chords_with_fingering: set[str] = set()

    for idx, c in enumerate(chords_data):
        name = c.get("name")
        if not name:
            errors.append(f"Chord #{idx}: missing 'name'")
            continue

        if name in chord_names_seen:
            errors.append(f"Chord '{name}': duplicate definition in chords.json")
        chord_names_seen.add(name)

        if name not in CANONICAL_CHORDS:
            errors.append(f"Chord '{name}': not in canonical chord registry")

        fingering = c.get("fingering")
        if not isinstance(fingering, list) or len(fingering) != 6:
            errors.append(f"Chord '{name}': fingering must be a list of 6 integers")
        else:
            for string_idx, fret in enumerate(fingering):
                if not isinstance(fret, int) or fret < -1 or fret > 24:
                    errors.append(f"Chord '{name}': invalid fret {fret} on string {string_idx}")

        chords_with_fingering.add(name)

    # 2. Validate songs.json
    song_keys_seen: set[tuple[str, str]] = set()

    for idx, s in enumerate(songs_data):
        title = s.get("title", "").strip()
        artist = s.get("artist", "").strip()
        genre = s.get("genre", "").strip()
        difficulty = s.get("difficulty")
        capo = s.get("capo_fret")
        chords = s.get("chords")

        song_id_label = f"Song #{idx} ('{title}' by '{artist}')"

        if not title:
            errors.append(f"Song #{idx}: title is empty")
        if not artist:
            errors.append(f"Song #{idx}: artist is empty")
        if not genre:
            errors.append(f"{song_id_label}: genre is empty")

        key = (title.lower(), artist.lower())
        if key in song_keys_seen:
            errors.append(f"{song_id_label}: duplicate (title, artist) detected")
        song_keys_seen.add(key)

        if not isinstance(difficulty, int) or difficulty < 1 or difficulty > 5:
            errors.append(f"{song_id_label}: difficulty must be integer between 1 and 5 (got {difficulty})")

        if capo is not None:
            if not isinstance(capo, int) or capo < 0 or capo > 12:
                errors.append(f"{song_id_label}: capo_fret must be null or 0 to 12 (got {capo})")

        if not isinstance(chords, list):
            errors.append(f"{song_id_label}: chords must be a list")
            continue

        if len(chords) < 3:
            errors.append(f"{song_id_label}: must have at least 3 chords (got {len(chords)})")
        if len(chords) > 7:
            errors.append(f"{song_id_label}: must have at most 7 chords (got {len(chords)})")

        for chord_name in chords:
            if chord_name not in CANONICAL_CHORDS:
                errors.append(f"{song_id_label}: chord '{chord_name}' is not canonical")
            if chord_name not in chords_with_fingering:
                errors.append(f"{song_id_label}: chord '{chord_name}' has no fingering data in chords.json")

    return errors


from sqlalchemy.engine import Engine

def seed_database(
    database_url_or_engine: str | Engine,
    chords_data: list[dict[str, Any]],
    songs_data: list[dict[str, Any]],
) -> dict[str, int]:
    """Idempotently seed chords and songs into the database using admin credentials."""
    if isinstance(database_url_or_engine, Engine):
        engine = database_url_or_engine
        should_dispose = False
    else:
        engine = create_engine(database_url_or_engine, echo=False)
        should_dispose = True

    try:
        # Ensure tables exist (for dev/testing)
        SQLModel.metadata.create_all(engine)

        with Session(engine) as session:
            # 1. Upsert chords
            chord_map: dict[str, Chord] = {}
            chords_inserted = 0

            for c_dict in chords_data:
                existing = session.exec(select(Chord).where(Chord.name == c_dict["name"])).first()
                if existing:
                    existing.is_barre = c_dict["is_barre"]
                    existing.fingering = c_dict["fingering"]
                    session.add(existing)
                    chord_map[c_dict["name"]] = existing
                else:
                    chord_obj = Chord(
                        name=c_dict["name"],
                        is_barre=c_dict["is_barre"],
                        fingering=c_dict["fingering"],
                    )
                    session.add(chord_obj)
                    chord_map[c_dict["name"]] = chord_obj
                    chords_inserted += 1

            session.commit()

            # Refresh chord IDs
            for name, chord_obj in chord_map.items():
                session.refresh(chord_obj)

            # 2. Upsert songs and junctions
            songs_inserted = 0
            songs_updated = 0

            for s_dict in songs_data:
                title = s_dict["title"].strip()
                artist = s_dict["artist"].strip()

                existing_song = session.exec(
                    select(Song).where(Song.title == title, Song.artist == artist)
                ).first()

                target_chord_objs = [chord_map[c_name] for c_name in s_dict["chords"] if c_name in chord_map]

                if existing_song:
                    existing_song.genre = s_dict["genre"]
                    existing_song.difficulty = s_dict["difficulty"]
                    existing_song.capo_fret = s_dict.get("capo_fret")
                    existing_song.chords = target_chord_objs
                    session.add(existing_song)
                    songs_updated += 1
                else:
                    song_obj = Song(
                        title=title,
                        artist=artist,
                        genre=s_dict["genre"],
                        difficulty=s_dict["difficulty"],
                        capo_fret=s_dict.get("capo_fret"),
                        chords=target_chord_objs,
                    )
                    session.add(song_obj)
                    songs_inserted += 1

            session.commit()

            return {
                "chords_total": len(chord_map),
                "chords_inserted": chords_inserted,
                "songs_inserted": songs_inserted,
                "songs_updated": songs_updated,
            }
    finally:
        if should_dispose:
            engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Chordly Database Seeder and Validator")
    parser.add_argument("--validate-only", action="store_true", help="Run validation without database insertion")
    parser.add_argument("--db-url", type=str, default=None, help="Database connection string")
    args = parser.parse_args()

    chords_file = backend_dir / "data" / "chords.json"
    songs_file = backend_dir / "data" / "songs.json"

    if not chords_file.exists():
        print(f"Error: {chords_file} does not exist", file=sys.stderr)
        sys.exit(1)

    if not songs_file.exists():
        print(f"Error: {songs_file} does not exist", file=sys.stderr)
        sys.exit(1)

    with open(chords_file, "r", encoding="utf-8") as f:
        chords_data = json.load(f)

    with open(songs_file, "r", encoding="utf-8") as f:
        songs_data = json.load(f)

    print(f"Validating catalog: {len(chords_data)} chords, {len(songs_data)} songs...")
    errors = validate_catalog(chords_data, songs_data)

    if errors:
        print(f"\nVALIDATION FAILED ({len(errors)} errors found):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print("Catalog validation passed with zero errors!")

    if args.validate_only:
        print("Validation only mode requested. Exiting successfully.")
        sys.exit(0)

    db_url = args.db_url or os.getenv("DATABASE_URL")
    if not db_url:
        sqlite_path = (backend_dir / "data" / "chordly_local.db").as_posix()
        db_url = f"sqlite:///{sqlite_path}"
        print(f"DATABASE_URL not set. Seeding local SQLite at {sqlite_path}")

    try:
        print("Seeding database using admin credential...")
        stats = seed_database(db_url, chords_data, songs_data)
        print("Seeding complete:")
        print(f"  Chords processed: {stats['chords_total']}")
        print(f"  Songs inserted: {stats['songs_inserted']}")
        print(f"  Songs updated: {stats['songs_updated']}")
    except OperationalError as e:
        print(f"Database connection error: {e}", file=sys.stderr)
        print("To start local Postgres: docker compose up -d", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
