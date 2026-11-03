"""Pure matching and ranking engine for Chordly.

This module contains zero web framework or database dependencies.
It operates purely on in-memory dataclasses and standard Python data structures.
No lyrics are ever stored, processed, or logged in this module.
"""

from dataclasses import dataclass, field
from itertools import combinations
from typing import Final, Iterable

from app.chords import is_barre_chord, normalize_chord


@dataclass(frozen=True)
class ChordData:
    """Represents a guitar chord shape."""

    name: str
    is_barre: bool = False
    fingering: list[int] | None = None  # 6 values: -1 = muted, 0 = open, >0 = fret number


@dataclass
class SongData:
    """Represents a song and its chord composition without lyrics."""

    title: str
    artist: str
    genre: str
    difficulty: int  # 1 to 5 scale
    chords: list[str]  # List of canonical chord names
    id: int | None = None
    capo_fret: int | None = None  # 0 to 12, or None if unknown

    def normalized_chord_set(self) -> set[str]:
        """Return the set of chords normalized to canonical spelling."""
        return {normalize_chord(c) for c in self.chords}


@dataclass(frozen=True)
class ChordRecommendation:
    """Recommendation for a single chord to learn next."""

    chord: str
    unlock_count: int
    is_barre: bool
    unlocked_song_titles: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ChordPairRecommendation:
    """Recommendation for a pair of chords to learn next."""

    chord_pair: tuple[str, str]  # Alphabetically sorted pair
    unlock_count: int
    barre_count: int
    unlocked_song_titles: list[str] = field(default_factory=list)


CLASSIFICATION_PLAYABLE: Final[str] = "playable"
CLASSIFICATION_NEAR: Final[str] = "near"
CLASSIFICATION_FAR: Final[str] = "far"

CLASSIFICATION_ORDER: Final[dict[str, int]] = {
    CLASSIFICATION_PLAYABLE: 0,
    CLASSIFICATION_NEAR: 1,
    CLASSIFICATION_FAR: 2,
}


def missing_chords(required: set[str], known: set[str]) -> set[str]:
    """Calculate the set of chords required by a song that the player does not yet know.

    Time Complexity: O(r) where r = len(required).
    Set difference in Python is linear with respect to the left-hand operand.
    """
    return required - known


def classify_song(song: SongData, known: set[str]) -> str:
    """Classify a song based on how many additional chords the user must learn.

    Categories:
    - 'playable': 0 chords missing (including songs with no chords)
    - 'near': 1 or 2 chords missing
    - 'far': 3 or more chords missing

    Time Complexity: O(c) where c is the number of chords in the song.
    """
    req = song.normalized_chord_set()
    missing = missing_chords(req, known)
    count = len(missing)

    if count == 0:
        return CLASSIFICATION_PLAYABLE
    if count in (1, 2):
        return CLASSIFICATION_NEAR
    return CLASSIFICATION_FAR


def rank_songs(songs: list[SongData], known: set[str]) -> list[SongData]:
    """Rank songs according to player suitability and accessibility.

    Sort order:
    1. Playable songs first, then near matches, then far matches.
    2. Fewer missing chords first (e.g. 1 missing before 2 missing).
    3. Lower difficulty first (1 to 5).
    4. Fewer total chords in the song (simpler composition).
    5. Title alphabetically as a deterministic tie-breaker.

    Time Complexity: O(s * c + s log s) where s is song count and c is average chord count.
    What makes it slow:
    Sorting millions of songs in Python memory without pagination or database indexing.
    Fine for hundreds or thousands of songs.
    """
    normalized_known = {normalize_chord(c) for c in known}

    def sort_key(s: SongData) -> tuple[int, int, int, int, str]:
        req = s.normalized_chord_set()
        missing = missing_chords(req, normalized_known)
        category = classify_song(s, normalized_known)
        category_rank = CLASSIFICATION_ORDER[category]
        missing_count = len(missing)
        total_chords = len(req)
        return (category_rank, missing_count, s.difficulty, total_chords, s.title.lower())

    return sorted(songs, key=sort_key)


def next_chords_to_learn(
    songs: list[SongData],
    known: set[str],
    limit: int | None = None,
    candidate_chords: Iterable[str] | None = None,
) -> list[ChordRecommendation]:
    """Recommend single chords that unlock the most new songs.

    A song is unlocked by chord C if the song currently requires 1 chord and
    that missing chord is C.

    Sort order:
    1. Unlock count (descending)
    2. Non-barre chords first (barre chords take more finger strength)
    3. Alphabetical by chord name (deterministic tie-breaker)

    Time Complexity: O(s * c + u log u) where s = songs, c = chords per song, u = unknown candidate chords.
    What makes it slow:
    If song count s is very large and unknown chords u is large, inspecting every song.
    """
    normalized_known = {normalize_chord(c) for c in known}

    # Pool of chords to evaluate
    pool: set[str] = set()
    if candidate_chords is not None:
        pool.update(normalize_chord(c) for c in candidate_chords)

    # Pre-index songs that are exactly 1 chord away
    unlock_map: dict[str, list[str]] = {}

    for song in songs:
        req = song.normalized_chord_set()
        pool.update(req)
        missing = missing_chords(req, normalized_known)
        if len(missing) == 1:
            missing_chord = next(iter(missing))
            if missing_chord not in unlock_map:
                unlock_map[missing_chord] = []
            unlock_map[missing_chord].append(song.title)

    # Chords to score are all unknown chords in the pool
    unknown_candidates = pool - normalized_known

    results: list[ChordRecommendation] = []
    for chord in unknown_candidates:
        unlocked_songs = unlock_map.get(chord, [])
        count = len(unlocked_songs)
        barre = is_barre_chord(chord)
        results.append(
            ChordRecommendation(
                chord=chord,
                unlock_count=count,
                is_barre=barre,
                unlocked_song_titles=sorted(unlocked_songs),
            )
        )

    # Sort: count descending (-count), non-barre first (0 then 1), alphabetically (chord)
    results.sort(key=lambda r: (-r.unlock_count, 1 if r.is_barre else 0, r.chord))

    if limit is not None and limit >= 0:
        return results[:limit]
    return results


# =====================================================================
# SECTION: PAIR MATCHING (Separated for clean future removal if needed)
# =====================================================================

def next_chord_pairs(
    songs: list[SongData],
    known: set[str],
    limit: int | None = None,
    candidate_chords: Iterable[str] | None = None,
) -> list[ChordPairRecommendation]:
    """Recommend pairs of chords that together unlock the most new songs.

    A song is unlocked by pair (C1, C2) if all missing chords for the song
    are contained within {C1, C2} and the song was not already playable.

    Sort order:
    1. Unlock count (descending)
    2. Fewer barre chords in the pair (0, 1, or 2)
    3. Alphabetical tie-breaker on (chord_1, chord_2)

    Time Complexity: O(s * c + p * s) where p is the number of candidate pairs (O(u^2)).
    With 30 unknown chords, p = 435 pairs.
    For 200 songs: 435 * 200 = 87,000 checks. Fast in Python.
    What makes it slow:
    Above 5,000 songs and 100 unknown chords, p * s reaches 50,000,000 operations,
    which creates noticeable latency in a synchronous request.
    """
    normalized_known = {normalize_chord(c) for c in known}

    # Find songs that need 1 or 2 chords to be playable
    eligible_songs: list[tuple[SongData, set[str]]] = []
    chords_in_songs: set[str] = set()

    for song in songs:
        req = song.normalized_chord_set()
        chords_in_songs.update(req)
        missing = missing_chords(req, normalized_known)
        if 1 <= len(missing) <= 2:
            eligible_songs.append((song, missing))

    pool: set[str] = chords_in_songs - normalized_known
    if candidate_chords is not None:
        pool.update(normalize_chord(c) for c in candidate_chords if normalize_chord(c) not in normalized_known)

    sorted_candidates = sorted(pool)
    pairs = list(combinations(sorted_candidates, 2))

    recommendations: list[ChordPairRecommendation] = []
    for c1, c2 in pairs:
        pair_set = {c1, c2}
        unlocked_titles: list[str] = []
        for song, missing in eligible_songs:
            if missing.issubset(pair_set):
                unlocked_titles.append(song.title)

        barre_count = (1 if is_barre_chord(c1) else 0) + (1 if is_barre_chord(c2) else 0)
        recommendations.append(
            ChordPairRecommendation(
                chord_pair=(c1, c2),
                unlock_count=len(unlocked_titles),
                barre_count=barre_count,
                unlocked_song_titles=sorted(unlocked_titles),
            )
        )

    # Sort: count descending (-count), barre count ascending, pair tuple alphabetically
    recommendations.sort(key=lambda r: (-r.unlock_count, r.barre_count, r.chord_pair))

    if limit is not None and limit >= 0:
        return recommendations[:limit]
    return recommendations
