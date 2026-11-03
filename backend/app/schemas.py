"""Pydantic validation schemas for API request and response models.

Enforces strict input bounds:
- known_chords: max 30 items, canonical chord validation
- String lengths: capped
- Integers: bounded
No lyrics are ever accepted, processed, or returned.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator

from app.chords import UnknownChordError, normalize_chord


class ChordResponse(BaseModel):
    """Guitar chord response schema."""

    id: Optional[int] = None
    name: str
    is_barre: bool
    fingering: list[int] = Field(description="6 values representing frets per string from low E to high e")


class SongResponse(BaseModel):
    """Song response schema without lyrics."""

    id: int
    title: str
    artist: str
    genre: str
    difficulty: int = Field(ge=1, le=5)
    capo_fret: Optional[int] = Field(default=None, ge=0, le=12)
    chords: list[str] = Field(description="List of canonical chord names")


class SongsListResponse(BaseModel):
    """Paginated list of songs."""

    items: list[SongResponse]
    total: int
    limit: int
    offset: int


class SongSheetPart(BaseModel):
    """A single song section (verse, chorus, bridge, etc.) with chords and lyrics."""

    part: str = Field(description="Section label e.g. 'verse 1', 'chorus', 'bridge'")
    chords: list[str] = Field(description="Ordered list of chord changes in this section")
    lyrics: str = Field(description="Lyrics text for this section")


class SongSheetResponse(BaseModel):
    """Full song with structured sections for chord+lyrics sheet view."""

    song: SongResponse
    parts: list[SongSheetPart]


class MatchRequest(BaseModel):
    """Request schema for song matching endpoint."""

    known_chords: list[str] = Field(
        default_factory=list,
        max_length=30,
        description="List of chords the player knows (maximum 30 items)",
    )
    genre: Optional[str] = Field(default=None, max_length=50)
    difficulty: Optional[int] = Field(default=None, ge=1, le=5)
    difficulty_max: Optional[int] = Field(default=None, ge=1, le=5)
    max_missing: Optional[int] = Field(default=2, ge=0, le=2)
    sort: Optional[Literal["best", "easiest"]] = "best"

    @field_validator("known_chords")
    @classmethod
    def validate_known_chords(cls, chords: list[str]) -> list[str]:
        """Validate and normalize every chord string in known_chords.

        Raises ValueError (which FastAPI translates to HTTP 422) if any chord is unknown.
        """
        normalized_list: list[str] = []
        for c in chords:
            try:
                norm = normalize_chord(c)
                if norm not in normalized_list:
                    normalized_list.append(norm)
            except UnknownChordError as e:
                raise ValueError(f"Invalid chord '{c}'. Must be a recognized guitar chord.") from e
        return normalized_list


class NearMatchItem(BaseModel):
    """A song requiring 1 or 2 additional chords with missing chords enumerated."""

    song: SongResponse
    missing: list[str]
    missing_count: int


class MatchResponse(BaseModel):
    """Response schema containing playable songs and near matches."""

    playable: list[SongResponse]
    near: list[NearMatchItem]
    total_playable: int
    total_near: int


class NextChordsRequest(BaseModel):
    """Request schema for chord learning recommendations."""

    known_chords: list[str] = Field(
        default_factory=list,
        max_length=30,
        description="Chords the player already knows",
    )
    limit: Optional[int] = Field(default=3, ge=1, le=20, description="Number of recommendations to return")

    @field_validator("known_chords")
    @classmethod
    def validate_known_chords(cls, chords: list[str]) -> list[str]:
        """Validate each chord against canonical chord catalogue."""
        normalized_list: list[str] = []
        for c in chords:
            try:
                norm = normalize_chord(c)
                if norm not in normalized_list:
                    normalized_list.append(norm)
            except UnknownChordError as e:
                raise ValueError(f"Invalid chord '{c}'. Must be a recognized guitar chord.") from e
        return normalized_list


class NextChordItem(BaseModel):
    """Single chord recommendation details."""

    chord: str
    unlock_count: int
    is_barre: bool
    unlocked_songs: list[str]


class NextChordsResponse(BaseModel):
    """Response schema containing ranked chord recommendations."""

    recommendations: list[NextChordItem]
