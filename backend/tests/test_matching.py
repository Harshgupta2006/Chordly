"""Comprehensive unit tests for the Chordly matching engine.

Tests cover all 8 required scenarios:
1. Empty known set
2. Known chords covering everything
3. A song with no chords
4. Duplicate chords
5. Alias and case normalization
6. Ranking ties and deterministic ordering
7. A chord that unlocks zero songs
8. Pairs beating single chords
Plus additional edge cases (barre tie-breaks, slash chords, invalid chords).
No lyrics are included in any test fixtures or asserts.
"""

import pytest
from app.chords import UnknownChordError, is_barre_chord, normalize_chord
from app.matching import (
    CLASSIFICATION_FAR,
    CLASSIFICATION_NEAR,
    CLASSIFICATION_PLAYABLE,
    ChordData,
    SongData,
    classify_song,
    missing_chords,
    next_chord_pairs,
    next_chords_to_learn,
    rank_songs,
)


# =====================================================================
# 1. EMPTY KNOWN SET
# =====================================================================

def test_empty_known_set():
    """Verify behavior when the user has selected zero known chords."""
    known: set[str] = set()
    song_small = SongData(title="Simple Song", artist="Artist A", genre="Folk", difficulty=1, chords=["G", "C"])
    song_large = SongData(title="Complex Song", artist="Artist B", genre="Rock", difficulty=3, chords=["G", "C", "D", "Em"])

    # missing_chords returns all chords required by the song
    missing_small = missing_chords(song_small.normalized_chord_set(), known)
    assert missing_small == {"G", "C"}
    assert len(missing_small) == 2

    # song_small (2 chords missing) is classified as near
    assert classify_song(song_small, known) == CLASSIFICATION_NEAR

    # song_large (4 chords missing) is classified as far
    assert classify_song(song_large, known) == CLASSIFICATION_FAR

    # Recommendations still work: chords from near songs are recommended
    recs = next_chords_to_learn([song_small, song_large], known)
    assert isinstance(recs, list)


# =====================================================================
# 2. KNOWN CHORDS COVERING EVERYTHING
# =====================================================================

def test_known_chords_covering_everything():
    """Verify behavior when the user knows every chord required by the songs."""
    known = {"C", "G", "D", "Em", "Am"}
    song1 = SongData(title="Song 1", artist="Artist 1", genre="Pop", difficulty=2, chords=["C", "G"])
    song2 = SongData(title="Song 2", artist="Artist 2", genre="Rock", difficulty=1, chords=["G", "D", "Em"])

    for s in [song1, song2]:
        missing = missing_chords(s.normalized_chord_set(), known)
        assert missing == set()
        assert classify_song(s, known) == CLASSIFICATION_PLAYABLE

    ranked = rank_songs([song1, song2], known)
    # Both are playable. Song 2 has difficulty 1, Song 1 has difficulty 2.
    # Therefore Song 2 should rank ahead of Song 1.
    assert ranked[0].title == "Song 2"
    assert ranked[1].title == "Song 1"

    # Next chords to learn should have 0 unlocks since everything is already playable
    recs = next_chords_to_learn([song1, song2], known)
    assert all(r.unlock_count == 0 for r in recs)


# =====================================================================
# 3. A SONG WITH NO CHORDS
# =====================================================================

def test_song_with_no_chords():
    """Verify that a song requiring 0 chords is playable regardless of known chords."""
    empty_song = SongData(title="Spoken Word", artist="Poet", genre="Spoken", difficulty=1, chords=[])
    regular_song = SongData(title="Guitar Song", artist="Band", genre="Rock", difficulty=1, chords=["G", "C"])

    known: set[str] = set()

    missing = missing_chords(empty_song.normalized_chord_set(), known)
    assert missing == set()
    assert classify_song(empty_song, known) == CLASSIFICATION_PLAYABLE

    ranked = rank_songs([regular_song, empty_song], known)
    # empty_song is playable (category 0), regular_song is near (category 1)
    assert ranked[0].title == "Spoken Word"
    assert ranked[1].title == "Guitar Song"


# =====================================================================
# 4. DUPLICATE CHORDS
# =====================================================================

def test_duplicate_chords():
    """Verify that duplicate chord entries in a song are handled idempotently."""
    song = SongData(
        title="Loop Song",
        artist="Strummer",
        genre="Acoustic",
        difficulty=1,
        chords=["G", "C", "G", "C", "G", "G", "C"],
    )
    req = song.normalized_chord_set()
    assert req == {"G", "C"}
    assert len(req) == 2

    # If user knows G only, missing should be only {"C"}
    known = {"G"}
    missing = missing_chords(req, known)
    assert missing == {"C"}
    assert classify_song(song, known) == CLASSIFICATION_NEAR

    # Adding C makes it playable
    assert classify_song(song, {"G", "C"}) == CLASSIFICATION_PLAYABLE


# =====================================================================
# 5. ALIAS AND CASE NORMALIZATION
# =====================================================================

def test_alias_and_case_normalization():
    """Verify chord normalization handles aliases, case variations, slash chords, and enharmonics."""
    # Aliases to canonical
    assert normalize_chord("A minor") == "Am"
    assert normalize_chord("amin") == "Am"
    assert normalize_chord("Amin") == "Am"
    assert normalize_chord("a minor 7") == "Am7"
    assert normalize_chord("c major") == "C"
    assert normalize_chord("cmaj") == "C"

    # Case insensitivity for basic notes
    assert normalize_chord("c") == "C"
    assert normalize_chord("d") == "D"
    assert normalize_chord("g") == "G"
    assert normalize_chord("am") == "Am"
    assert normalize_chord("em") == "Em"

    # Slash chords: base shape is extracted
    assert normalize_chord("G/B") == "G"
    assert normalize_chord("D/F#") == "D"
    assert normalize_chord("C/E") == "C"

    # Enharmonics: flats mapped to canonical sharps
    assert normalize_chord("Db") == "C#"
    assert normalize_chord("Eb") == "D#"
    assert normalize_chord("Gb") == "F#"
    assert normalize_chord("Ab") == "G#"
    assert normalize_chord("Bb") == "A#"
    assert normalize_chord("Dbm") == "C#m"

    # Whitespace trimming
    assert normalize_chord("  Em  ") == "Em"

    # Unknown chords must raise validation error, never silently dropped
    with pytest.raises(UnknownChordError) as exc_info:
        normalize_chord("Hmaj7")
    assert "Hmaj7" in str(exc_info.value)

    with pytest.raises(UnknownChordError):
        normalize_chord("NonExistentChordX")

    with pytest.raises(UnknownChordError):
        normalize_chord("")


# =====================================================================
# 6. RANKING TIES AND DETERMINISTIC ORDER
# =====================================================================

def test_ranking_ties_and_deterministic_order():
    """Verify ranking precedence: category -> missing count -> difficulty -> total chords -> title."""
    known = {"C", "G"}

    # Three songs with exact same stats: playable (0 missing), difficulty 2, 2 chords
    # Should sort alphabetically by title: "Alpha", "Beta", "Gamma"
    song_gamma = SongData(title="Gamma", artist="Art", genre="Pop", difficulty=2, chords=["C", "G"])
    song_alpha = SongData(title="Alpha", artist="Art", genre="Pop", difficulty=2, chords=["C", "G"])
    song_beta = SongData(title="Beta", artist="Art", genre="Pop", difficulty=2, chords=["C", "G"])

    ranked = rank_songs([song_gamma, song_alpha, song_beta], known)
    assert [s.title for s in ranked] == ["Alpha", "Beta", "Gamma"]

    # Precedence check:
    # Song A: Playable (0 missing, diff 5)
    # Song B: Near (1 missing, diff 1)
    # Even though Song B has lower difficulty, playable comes before near.
    song_playable_hard = SongData(title="Hard Playable", artist="Art", genre="Rock", difficulty=5, chords=["C", "G"])
    song_near_easy = SongData(title="Easy Near", artist="Art", genre="Folk", difficulty=1, chords=["C", "G", "D"])

    ranked_precedence = rank_songs([song_near_easy, song_playable_hard], known)
    assert ranked_precedence[0].title == "Hard Playable"
    assert ranked_precedence[1].title == "Easy Near"

    # Total chords tie-breaker:
    # Both near with 1 missing, same difficulty 2. Song with 3 chords beats song with 4 chords.
    song_fewer_chords = SongData(title="Three Chords", artist="Art", genre="Pop", difficulty=2, chords=["C", "G", "D"])
    song_more_chords = SongData(title="Four Chords", artist="Art", genre="Pop", difficulty=2, chords=["C", "G", "Em", "Am"])

    # If known = {"C", "G", "Em"}, both need 1 chord (D vs Am)
    ranked_chords = rank_songs([song_more_chords, song_fewer_chords], {"C", "G", "Em"})
    assert ranked_chords[0].title == "Three Chords"
    assert ranked_chords[1].title == "Four Chords"


# =====================================================================
# 7. A CHORD THAT UNLOCKS ZERO SONGS
# =====================================================================

def test_chord_that_unlocks_zero_songs():
    """Verify that an unknown chord unlocking 0 songs is returned with count 0."""
    known = {"C", "G"}
    # Song 1 needs D
    song1 = SongData(title="Song 1", artist="Band", genre="Folk", difficulty=1, chords=["C", "G", "D"])
    # Song 2 needs Em and F
    song2 = SongData(title="Song 2", artist="Band", genre="Rock", difficulty=2, chords=["C", "G", "Em", "F"])

    # Evaluate recommendations with an explicit candidate chord "A7" that no song uses
    recs = next_chords_to_learn([song1, song2], known, candidate_chords=["A7", "D"])
    rec_map = {r.chord: r.unlock_count for r in recs}

    assert "A7" in rec_map
    assert rec_map["A7"] == 0
    assert rec_map["D"] == 1

    # D should be ranked ahead of A7
    assert recs[0].chord == "D"
    assert recs[0].unlock_count == 1


# =====================================================================
# 8. PAIRS BEATING SINGLE CHORDS
# =====================================================================

def test_pairs_beating_single_chords():
    """Verify scenario where no single chord unlocks multiple songs, but a pair unlocks several.

    Scenario:
    User knows: {C, G}.
    Song 1 requires: {C, G, D, Em} -> missing {D, Em}
    Song 2 requires: {C, G, D, Em} -> missing {D, Em}
    Song 3 requires: {C, G, D, Em} -> missing {D, Em}

    Single chord learning:
    - Adding D alone unlocks 0 songs (all 3 still need Em).
    - Adding Em alone unlocks 0 songs (all 3 still need D).
    Single chord unlock counts: D = 0, Em = 0.

    Pair chord learning:
    - Adding the pair (D, Em) unlocks all 3 songs!
    Pair unlock count: (D, Em) = 3.
    """
    known = {"C", "G"}
    song1 = SongData(title="Track 1", artist="Band", genre="Rock", difficulty=2, chords=["C", "G", "D", "Em"])
    song2 = SongData(title="Track 2", artist="Band", genre="Rock", difficulty=2, chords=["C", "G", "D", "Em"])
    song3 = SongData(title="Track 3", artist="Band", genre="Rock", difficulty=2, chords=["C", "G", "D", "Em"])

    songs = [song1, song2, song3]

    # Single chord recommendations
    single_recs = next_chords_to_learn(songs, known)
    max_single_unlocks = max((r.unlock_count for r in single_recs), default=0)
    assert max_single_unlocks == 0

    # Pair recommendations
    pair_recs = next_chord_pairs(songs, known)
    assert len(pair_recs) > 0
    top_pair = pair_recs[0]
    assert top_pair.chord_pair == ("D", "Em")
    assert top_pair.unlock_count == 3
    assert top_pair.unlock_count > max_single_unlocks


# =====================================================================
# 9. BARRE TIE-BREAKING
# =====================================================================

def test_barre_chord_tie_breaking():
    """When two chords unlock the same number of songs, non-barre chords rank first."""
    known = {"C", "G"}
    # Song A needs D (open chord, not barre)
    song_a = SongData(title="Song A", artist="Art", genre="Pop", difficulty=1, chords=["C", "G", "D"])
    # Song B needs Bm (barre chord)
    song_b = SongData(title="Song B", artist="Art", genre="Pop", difficulty=2, chords=["C", "G", "Bm"])

    recs = next_chords_to_learn([song_a, song_b], known)
    d_rec = next(r for r in recs if r.chord == "D")
    bm_rec = next(r for r in recs if r.chord == "Bm")

    assert d_rec.unlock_count == 1
    assert bm_rec.unlock_count == 1
    assert not d_rec.is_barre
    assert bm_rec.is_barre

    # In sorted output, D must appear before Bm
    d_index = recs.index(d_rec)
    bm_index = recs.index(bm_rec)
    assert d_index < bm_index


def test_chord_data_dataclass():
    """Verify ChordData structure and defaults."""
    c = ChordData(name="C", is_barre=False, fingering=[-1, 3, 2, 0, 1, 0])
    assert c.name == "C"
    assert not c.is_barre
    assert c.fingering == [-1, 3, 2, 0, 1, 0]
