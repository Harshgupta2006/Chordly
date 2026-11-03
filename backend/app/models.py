"""SQLModel database models for Chordly.

Defines tables for Chord, Song, and the SongChord junction table.
No lyrics are stored in any model or table column.
"""

from typing import Optional
from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class SongChord(SQLModel, table=True):
    """Many-to-many junction table linking songs to their required chords."""

    __tablename__ = "song_chord"

    song_id: int = Field(foreign_key="song.id", primary_key=True, index=True)
    chord_id: int = Field(foreign_key="chord.id", primary_key=True, index=True)


class Chord(SQLModel, table=True):
    """Guitar chord model storing canonical name, barre status, and string fingerings."""

    __tablename__ = "chord"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True, max_length=20, description="Canonical chord name")
    is_barre: bool = Field(default=False, description="Whether the chord requires a barre hand shape")
    # 6 values representing strings low E to high e: -1 = muted, 0 = open, >0 = fret position
    fingering: list[int] = Field(sa_column=Column(JSON, nullable=False))

    # Relationships
    songs: list["Song"] = Relationship(back_populates="chords", link_model=SongChord)


class Song(SQLModel, table=True):
    """Song model storing metadata and chord composition. Strictly no lyrics."""

    __tablename__ = "song"
    __table_args__ = (
        UniqueConstraint("title", "artist", name="uq_song_title_artist"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(index=True, max_length=200)
    artist: str = Field(index=True, max_length=200)
    genre: str = Field(index=True, max_length=50)
    difficulty: int = Field(ge=1, le=5, description="Derived difficulty on 1 to 5 scale")
    capo_fret: Optional[int] = Field(default=None, ge=0, le=12, nullable=True, description="Capo fret position if known")

    # Relationships
    chords: list[Chord] = Relationship(back_populates="songs", link_model=SongChord)
