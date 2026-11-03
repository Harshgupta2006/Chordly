"""Initial database schema for Chordly: Chord, Song, and SongChord tables.

Revision ID: 001_initial_schema
Revises: None
Create Date: 2026-10-17 02:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create chord table
    op.create_table(
        "chord",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column("is_barre", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("fingering", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_chord_name"),
    )
    op.create_index(op.f("ix_chord_name"), "chord", ["name"], unique=True)

    # 2. Create song table
    op.create_table(
        "song",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("artist", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("genre", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("difficulty", sa.Integer(), nullable=False),
        sa.Column("capo_fret", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("title", "artist", name="uq_song_title_artist"),
    )
    op.create_index(op.f("ix_song_title"), "song", ["title"], unique=False)
    op.create_index(op.f("ix_song_artist"), "song", ["artist"], unique=False)
    op.create_index(op.f("ix_song_genre"), "song", ["genre"], unique=False)

    # 3. Create song_chord junction table
    op.create_table(
        "song_chord",
        sa.Column("song_id", sa.Integer(), nullable=False),
        sa.Column("chord_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["chord_id"], ["chord.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["song_id"], ["song.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("song_id", "chord_id"),
    )
    op.create_index(op.f("ix_song_chord_chord_id"), "song_chord", ["chord_id"], unique=False)
    op.create_index(op.f("ix_song_chord_song_id"), "song_chord", ["song_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_song_chord_song_id"), table_name="song_chord")
    op.drop_index(op.f("ix_song_chord_chord_id"), table_name="song_chord")
    op.drop_table("song_chord")

    op.drop_index(op.f("ix_song_genre"), table_name="song")
    op.drop_index(op.f("ix_song_artist"), table_name="song")
    op.drop_index(op.f("ix_song_title"), table_name="song")
    op.drop_table("song")

    op.drop_index(op.f("ix_chord_name"), table_name="chord")
    op.drop_table("chord")
