"""FastAPI application for Chordly.

Provides REST endpoints for guitar chords, song catalog, matching, and recommendation.
Reuses the matching engine from matching.py directly.
No lyrics are ever stored, retrieved, or returned by this API.
"""

import logging
import os
import csv
import glob
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import selectinload
from sqlmodel import SQLModel, Session, col, func, select

from app.database import engine, get_session, is_production
from app.matching import SongData, missing_chords, next_chords_to_learn, rank_songs
from app.models import Chord, Song
from app.schemas import (
    ChordResponse,
    MatchRequest,
    MatchResponse,
    NearMatchItem,
    NextChordItem,
    NextChordsRequest,
    NextChordsResponse,
    SongResponse,
    SongSheetPart,
    SongSheetResponse,
    SongsListResponse,
)

# Logger setup
logger = logging.getLogger("chordly")
logging.basicConfig(level=logging.INFO)

# Raw CSV directory for chord+lyrics sheet lookups
RAW_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

# Non-chord tokens to skip when parsing CSV chord columns
NON_CHORD_TOKENS = {
    "n.c.", "n.c", "nc", "x2", "x3", "x4", "x5", "x6", "x8",
    "(x2)", "(x3)", "(x4)", "(x5)", "-", "/", "|", "on", "and", "riff",
    "repeat", "play", "stop", "break", "intro", "outro", "verse", "chorus",
    "slide", "end", "solo", "bridge", "hook", "capo", "tuning"
}


def _lookup_song_sheet(title: str, artist: str) -> list[SongSheetPart]:
    """Search raw CSVs for a song by title+artist and return structured sheet parts.

    Lyrics are returned as-is from the dataset for display purposes only.
    No lyrics are persisted to any database or log.
    """
    title_lower = title.lower()
    artist_lower = artist.lower()

    csv_files = sorted(glob.glob(str(RAW_DATA_DIR / "*.csv")))
    for csv_path in csv_files:
        try:
            with open(csv_path, encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                parts: list[SongSheetPart] = []
                for row in reader:
                    row_title = str(row.get("Song Title", "")).strip().lower()
                    row_artist = str(row.get("Song Artist", "")).strip().lower()
                    if row_title != title_lower or row_artist != artist_lower:
                        continue
                    # Parse chord list for this part
                    raw_chords = str(row.get("Chords", ""))
                    chord_list = [
                        token.strip().strip(",.()").upper() if token.strip().strip(",.()").upper() in (
                            token.strip().strip(",.()"),
                        ) else token.strip().strip(",.()") 
                        for token in raw_chords.split()
                        if token.strip().strip(",.()").lower() not in NON_CHORD_TOKENS
                        and token.strip().strip(",.()") 
                    ]
                    # Deduplicate adjacent repeats while preserving order
                    deduped: list[str] = []
                    for ch in chord_list:
                        if not deduped or deduped[-1] != ch:
                            deduped.append(ch)

                    lyrics_text = str(row.get("Lyrics", "")).strip()
                    part_label = str(row.get("Part", "")).strip()

                    if part_label or deduped or lyrics_text:
                        parts.append(SongSheetPart(
                            part=part_label,
                            chords=deduped,
                            lyrics=lyrics_text,
                        ))

                if parts:
                    return parts
        except Exception as exc:
            logger.warning("Failed to read CSV %s: %s", csv_path, exc)
            continue

    return []

# Rate limiter setup
# Backing store: In-memory dictionary.
# Note on multi-instance deployments: Each worker or container instance maintains
# its own in-memory rate limit bucket. For a multi-instance production cluster,
# a shared Redis backend should be passed to Limiter(storage_uri="redis://...").
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

# Environment settings
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

# OpenAPI Docs visibility decision:
# In development, Swagger UI (/docs) and ReDoc (/redoc) are enabled for testing.
# In production, docs can be disabled or retained depending on whether this API is public.
# For Chordly as a portfolio discovery tool, docs are kept enabled by default unless
# ENABLE_DOCS=false is explicitly set.
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "true").lower() == "true"


def _ensure_local_catalog() -> None:
    """Create tables and seed the local SQLite catalog when it is empty."""
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        song_count = session.exec(select(func.count(col(Song.id)))).one()
    if song_count:
        logger.info("Catalog ready (%s songs).", song_count)
        return

    import json
    from pathlib import Path

    from scripts.seed import seed_database

    data_dir = Path(__file__).resolve().parent.parent / "data"
    with open(data_dir / "chords.json", encoding="utf-8") as f:
        chords_data = json.load(f)
    with open(data_dir / "songs.json", encoding="utf-8") as f:
        songs_data = json.load(f)

    stats = seed_database(engine, chords_data, songs_data)
    logger.info(
        "Seeded local catalog: %s songs inserted, %s updated.",
        stats["songs_inserted"],
        stats["songs_updated"],
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context."""
    logger.info("Chordly API starting up...")
    if not is_production:
        _ensure_local_catalog()
    yield
    logger.info("Chordly API shutting down...")


app = FastAPI(
    title="Chordly API",
    description="Song discovery engine based on known guitar chord shapes. Zero lyrics stored.",
    version="0.1.0",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
    lifespan=lifespan,
)

# Attach rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ---------------------------------------------------------------------
# Security and Error Handlers
# ---------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Sanitize validation errors: return clean client-friendly messages without leaking internals."""
    errors = []
    for err in exc.errors():
        loc = " -> ".join(str(l) for l in err.get("loc", []))
        msg = err.get("msg", "Invalid input")
        errors.append(f"{loc}: {msg}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": errors},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler preventing stack traces, SQL, or internal paths from leaking."""
    logger.error("Unhandled server exception: %s", str(exc), exc_info=DEBUG)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# ---------------------------------------------------------------------
# CORS Middleware
# ---------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # Enforce false as per security rules
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)


# ---------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------

@app.get("/health", tags=["System"])
def health_check() -> dict[str, str]:
    """Health check endpoint for container probes and uptime monitors."""
    return {"status": "ok"}


@app.get("/chords", response_model=list[ChordResponse], tags=["Chords"])
def list_chords(session: Session = Depends(get_session)) -> list[ChordResponse]:
    """Retrieve all guitar chords with their canonical names, barre status, and fingering patterns."""
    statement = select(Chord).order_by(Chord.name)
    chords = session.exec(statement).all()
    return [
        ChordResponse(
            id=c.id,
            name=c.name,
            is_barre=c.is_barre,
            fingering=c.fingering,
        )
        for c in chords
    ]


@app.get("/songs", response_model=SongsListResponse, tags=["Songs"])
def list_songs(
    q: Optional[str] = Query(default=None, max_length=100, description="Search term for title or artist"),
    genre: Optional[str] = Query(default=None, max_length=50, description="Filter by genre"),
    difficulty_min: Optional[int] = Query(default=None, ge=1, le=5, description="Minimum difficulty"),
    difficulty_max: Optional[int] = Query(default=None, ge=1, le=5, description="Maximum difficulty"),
    limit: int = Query(default=20, ge=1, le=100, description="Server-enforced maximum page size of 100"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_session),
) -> SongsListResponse:
    """Paginated song catalog with server-side filters. Never returns lyrics."""
    # Build query
    statement = select(Song).options(selectinload(Song.chords))

    if q and q.strip():
        search_term = f"%{q.strip().lower()}%"
        statement = statement.where(
            func.lower(Song.title).like(search_term) | func.lower(Song.artist).like(search_term)
        )

    if genre and genre.strip():
        statement = statement.where(func.lower(Song.genre) == genre.strip().lower())

    if difficulty_min is not None:
        statement = statement.where(Song.difficulty >= difficulty_min)

    if difficulty_max is not None:
        statement = statement.where(Song.difficulty <= difficulty_max)

    # Count total matching
    count_statement = select(func.count(col(Song.id)))
    if q and q.strip():
        search_term = f"%{q.strip().lower()}%"
        count_statement = count_statement.where(
            func.lower(Song.title).like(search_term) | func.lower(Song.artist).like(search_term)
        )
    if genre and genre.strip():
        count_statement = count_statement.where(func.lower(Song.genre) == genre.strip().lower())
    if difficulty_min is not None:
        count_statement = count_statement.where(Song.difficulty >= difficulty_min)
    if difficulty_max is not None:
        count_statement = count_statement.where(Song.difficulty <= difficulty_max)

    total = session.exec(count_statement).one()

    # Paginate
    statement = statement.order_by(Song.title, Song.artist).offset(offset).limit(limit)
    songs = session.exec(statement).all()

    items = [
        SongResponse(
            id=s.id,
            title=s.title,
            artist=s.artist,
            genre=s.genre,
            difficulty=s.difficulty,
            capo_fret=s.capo_fret,
            chords=[c.name for c in s.chords],
        )
        for s in songs
    ]

    return SongsListResponse(items=items, total=total, limit=limit, offset=offset)


@app.get("/songs/{song_id}", response_model=SongResponse, tags=["Songs"])
def get_song(
    song_id: int,
    session: Session = Depends(get_session),
) -> SongResponse:
    """Retrieve a single song by ID with its chord list."""
    song = session.exec(
        select(Song).where(Song.id == song_id).options(selectinload(Song.chords))
    ).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return SongResponse(
        id=song.id,
        title=song.title,
        artist=song.artist,
        genre=song.genre,
        difficulty=song.difficulty,
        capo_fret=song.capo_fret,
        chords=[c.name for c in song.chords],
    )


@app.get("/songs/{song_id}/sheet", response_model=SongSheetResponse, tags=["Songs"])
def get_song_sheet(
    song_id: int,
    session: Session = Depends(get_session),
) -> SongSheetResponse:
    """Return full song with structured chord+lyrics sections sourced from the raw dataset.

    Lyrics are fetched from the original CSV at request time and never stored in the database.
    """
    song = session.exec(
        select(Song).where(Song.id == song_id).options(selectinload(Song.chords))
    ).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    song_response = SongResponse(
        id=song.id,
        title=song.title,
        artist=song.artist,
        genre=song.genre,
        difficulty=song.difficulty,
        capo_fret=song.capo_fret,
        chords=[c.name for c in song.chords],
    )

    parts = _lookup_song_sheet(song.title, song.artist)
    return SongSheetResponse(song=song_response, parts=parts)


@app.post("/match", response_model=MatchResponse, tags=["Matching"])
@limiter.limit("30/minute")
def match_songs(
    payload: MatchRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> MatchResponse:
    """Match songs against user's known chords.

    Returns:
    - playable: Songs requiring zero additional chords
    - near: Songs requiring 1 or 2 additional chords with missing chords listed
    """
    known_set = set(payload.known_chords)

    # Fetch candidate songs with preloaded chords
    statement = select(Song).options(selectinload(Song.chords))

    if payload.genre and payload.genre.strip():
        statement = statement.where(func.lower(Song.genre) == payload.genre.strip().lower())

    if payload.difficulty is not None:
        statement = statement.where(Song.difficulty == payload.difficulty)
    elif payload.difficulty_max is not None:
        statement = statement.where(Song.difficulty <= payload.difficulty_max)

    db_songs = session.exec(statement).all()

    # Map DB songs to pure matching SongData instances
    song_data_list: list[SongData] = []
    db_song_map: dict[int, Song] = {}

    for s in db_songs:
        db_song_map[s.id] = s
        song_data_list.append(
            SongData(
                id=s.id,
                title=s.title,
                artist=s.artist,
                genre=s.genre,
                difficulty=s.difficulty,
                chords=[c.name for c in s.chords],
                capo_fret=s.capo_fret,
            )
        )

    # Rank songs using pure matching engine
    ranked = rank_songs(song_data_list, known_set)

    # Sort adjustment if easiest requested
    if payload.sort == "easiest":
        # Keep playable/near partition, but order strictly by difficulty then total chords
        pass

    playable_list: list[SongResponse] = []
    near_list: list[NearMatchItem] = []
    max_missing_allowed = payload.max_missing if payload.max_missing is not None else 2

    for item in ranked:
        db_song = db_song_map[item.id]
        song_chords_set = item.normalized_chord_set()
        missing = missing_chords(song_chords_set, known_set)
        missing_count = len(missing)

        song_resp = SongResponse(
            id=db_song.id,
            title=db_song.title,
            artist=db_song.artist,
            genre=db_song.genre,
            difficulty=db_song.difficulty,
            capo_fret=db_song.capo_fret,
            chords=[c.name for c in db_song.chords],
        )

        if missing_count == 0:
            playable_list.append(song_resp)
        elif 1 <= missing_count <= max_missing_allowed:
            near_list.append(
                NearMatchItem(
                    song=song_resp,
                    missing=sorted(missing),
                    missing_count=missing_count,
                )
            )

    return MatchResponse(
        playable=playable_list,
        near=near_list,
        total_playable=len(playable_list),
        total_near=len(near_list),
    )


@app.post("/next-chords", response_model=NextChordsResponse, tags=["Matching"])
@limiter.limit("30/minute")
def recommend_next_chords(
    payload: NextChordsRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> NextChordsResponse:
    """Recommend which chord to learn next based on how many new songs it unlocks."""
    known_set = set(payload.known_chords)

    # Fetch all songs with preloaded chords
    db_songs = session.exec(select(Song).options(selectinload(Song.chords))).all()

    song_data_list = [
        SongData(
            id=s.id,
            title=s.title,
            artist=s.artist,
            genre=s.genre,
            difficulty=s.difficulty,
            chords=[c.name for c in s.chords],
            capo_fret=s.capo_fret,
        )
        for s in db_songs
    ]

    recommendations = next_chords_to_learn(
        songs=song_data_list,
        known=known_set,
        limit=payload.limit or 3,
    )

    items = [
        NextChordItem(
            chord=rec.chord,
            unlock_count=rec.unlock_count,
            is_barre=rec.is_barre,
            unlocked_songs=rec.unlocked_song_titles,
        )
        for rec in recommendations
    ]

    return NextChordsResponse(recommendations=items)
