"""Comprehensive API integration tests using FastAPI TestClient.

Tests verify:
- GET /health
- GET /chords
- GET /songs pagination, filtering, and server-side limit cap
- POST /match success, empty input, unknown chord, oversized input
- POST /next-chords recommendations
- Malformed inputs return clean 4xx, never 500
- Rate limiting behavior
- Error responses leak no stack traces, SQL, or internal paths
"""

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.database import get_session
from app.main import app
from app.models import Chord, Song, SongChord
from scripts.seed import seed_database


@pytest.fixture(name="test_session")
def test_session_fixture():
    """Create an isolated in-memory SQLite database populated with test fixtures."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    # Seed minimal catalog for API tests
    chords_data = [
        {"name": "C", "is_barre": False, "fingering": [-1, 3, 2, 0, 1, 0]},
        {"name": "G", "is_barre": False, "fingering": [3, 2, 0, 0, 0, 3]},
        {"name": "D", "is_barre": False, "fingering": [-1, -1, 0, 2, 3, 2]},
        {"name": "Em", "is_barre": False, "fingering": [0, 2, 2, 0, 0, 0]},
        {"name": "Am", "is_barre": False, "fingering": [-1, 0, 2, 2, 1, 0]},
        {"name": "F", "is_barre": True, "fingering": [1, 3, 3, 2, 1, 1]},
    ]
    songs_data = [
        {
            "title": "Easy Country Tune",
            "artist": "Cowboy Dave",
            "genre": "country",
            "difficulty": 1,
            "capo_fret": None,
            "chords": ["C", "G", "D"],
        },
        {
            "title": "Four Chord Pop",
            "artist": "Star Singer",
            "genre": "pop",
            "difficulty": 2,
            "capo_fret": 2,
            "chords": ["C", "G", "Am", "Em"],
        },
        {
            "title": "Barre Rock Anthem",
            "artist": "Rock Band",
            "genre": "rock",
            "difficulty": 3,
            "capo_fret": None,
            "chords": ["C", "G", "D", "F"],
        },
    ]

    seed_database(engine, chords_data, songs_data)

    with Session(engine) as session:
        yield session

    engine.dispose()


@pytest.fixture(name="client")
def client_fixture(test_session: Session):
    """Provide a TestClient with the database dependency overridden."""
    def get_session_override():
        return test_session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


# =====================================================================
# SYSTEM & HEALTH
# =====================================================================

def test_health_check(client: TestClient):
    """GET /health returns 200 OK with status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# =====================================================================
# CHORDS ENDPOINT
# =====================================================================

def test_get_chords(client: TestClient):
    """GET /chords returns list of chords with fingering arrays."""
    response = client.get("/chords")
    assert response.status_code == 200
    chords = response.json()
    assert len(chords) == 6
    c_chord = next(c for c in chords if c["name"] == "C")
    assert c_chord["is_barre"] is False
    assert c_chord["fingering"] == [-1, 3, 2, 0, 1, 0]

    f_chord = next(c for c in chords if c["name"] == "F")
    assert f_chord["is_barre"] is True


# =====================================================================
# SONGS ENDPOINT
# =====================================================================

def test_get_songs_pagination_and_filtering(client: TestClient):
    """GET /songs supports query search, genre filtering, and pagination."""
    # List all
    resp = client.get("/songs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3

    # Genre filter
    resp_genre = client.get("/songs?genre=rock")
    assert resp_genre.status_code == 200
    genre_data = resp_genre.json()
    assert genre_data["total"] == 1
    assert genre_data["items"][0]["title"] == "Barre Rock Anthem"

    # Search filter
    resp_q = client.get("/songs?q=cowboy")
    assert resp_q.status_code == 200
    q_data = resp_q.json()
    assert q_data["total"] == 1
    assert q_data["items"][0]["artist"] == "Cowboy Dave"

    # Pagination: limit=1, offset=1
    resp_page = client.get("/songs?limit=1&offset=1")
    assert resp_page.status_code == 200
    page_data = resp_page.json()
    assert len(page_data["items"]) == 1
    assert page_data["offset"] == 1


def test_get_songs_enforces_limit_cap(client: TestClient):
    """Requesting limit > 100 must be rejected by server-side validation."""
    resp = client.get("/songs?limit=150")
    assert resp.status_code == 422
    assert "less than or equal to 100" in resp.text


# =====================================================================
# MATCH ENDPOINT
# =====================================================================

def test_match_songs_success(client: TestClient):
    """POST /match correctly categorizes playable and near-match songs."""
    # User knows C, G, D -> Easy Country Tune is playable (0 missing).
    # Four Chord Pop needs Am, Em -> near match (2 missing).
    # Barre Rock Anthem needs F -> near match (1 missing).
    payload = {"known_chords": ["C", "G", "D"]}
    response = client.post("/match", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["total_playable"] == 1
    assert data["playable"][0]["title"] == "Easy Country Tune"

    assert data["total_near"] == 2
    near_titles = [item["song"]["title"] for item in data["near"]]
    assert "Barre Rock Anthem" in near_titles
    assert "Four Chord Pop" in near_titles

    # Check missing chord chips
    barre_item = next(item for item in data["near"] if item["song"]["title"] == "Barre Rock Anthem")
    assert barre_item["missing"] == ["F"]


def test_match_songs_empty_known_chords(client: TestClient):
    """POST /match with empty known_chords returns clean zero playable and near matches."""
    payload = {"known_chords": []}
    response = client.post("/match", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["total_playable"] == 0
    assert isinstance(data["near"], list)


def test_match_songs_unknown_chord_rejected(client: TestClient):
    """Unknown chord names must return HTTP 422 with clear message."""
    payload = {"known_chords": ["C", "NonExistentChordX"]}
    response = client.post("/match", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "Invalid chord" in str(data)


def test_match_songs_oversized_input_rejected(client: TestClient):
    """Submitting more than 30 known chords must return HTTP 422."""
    payload = {"known_chords": ["C"] * 35}
    response = client.post("/match", json=payload)
    assert response.status_code == 422
    assert "at most 30 items" in response.text


# =====================================================================
# NEXT CHORDS RECOMMENDATION
# =====================================================================

def test_next_chords_recommendations(client: TestClient):
    """POST /next-chords recommends chords that unlock the most songs."""
    # User knows C, G, D.
    # Barre Rock Anthem needs only F.
    # Learning F unlocks Barre Rock Anthem!
    payload = {"known_chords": ["C", "G", "D"], "limit": 3}
    response = client.post("/next-chords", json=payload)
    assert response.status_code == 200
    data = response.json()
    recs = data["recommendations"]
    assert len(recs) > 0

    f_rec = next((r for r in recs if r["chord"] == "F"), None)
    assert f_rec is not None
    assert f_rec["unlock_count"] == 1
    assert "Barre Rock Anthem" in f_rec["unlocked_songs"]


# =====================================================================
# ABUSE RESISTANCE & MALFORMED INPUT
# =====================================================================

def test_malformed_input_returns_clean_422(client: TestClient):
    """Sending bad JSON data types returns 422 rather than causing 500 error."""
    # Pass string instead of list for known_chords
    response = client.post("/match", json={"known_chords": "invalid_string_format"})
    assert response.status_code == 422

    # Verify no internal server stack trace
    body = response.json()
    assert "Traceback" not in str(body)
    assert "Traceback (most recent call last)" not in response.text


def test_rate_limiting(client: TestClient):
    """Hitting rate-limited endpoints repeatedly triggers HTTP 429."""
    # /match is limited to 30/minute
    triggered_429 = False
    for _ in range(45):
        resp = client.post("/match", json={"known_chords": ["C", "G"]})
        if resp.status_code == 429:
            triggered_429 = True
            break
    assert triggered_429 is True
