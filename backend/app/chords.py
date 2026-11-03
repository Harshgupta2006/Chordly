"""Chord normalization and canonical definitions for Chordly.

This file serves as the single source of truth for canonical chord names,
aliases, enharmonic equivalents (sharps and flats), and barre chord classification.
No lyrics are processed or stored in this module.
"""

from typing import Final


class UnknownChordError(ValueError):
    """Raised when a chord string cannot be resolved to any canonical chord."""

    def __init__(self, chord: str) -> None:
        self.chord = chord
        super().__init__(f"Unknown chord: '{chord}'. Not recognized in canonical catalogue.")


# Canonical chord set.
# Standard guitar shapes: open major/minor, dominant 7ths, minor 7ths,
# major 7ths, suspended chords, add9, and common barre chords.
CANONICAL_CHORDS: Final[frozenset[str]] = frozenset({
    # Open Majors
    "C", "D", "E", "G", "A",
    # Open Minors
    "Am", "Dm", "Em",
    # Dominant 7ths
    "A7", "B7", "C7", "D7", "E7", "G7",
    # Minor 7ths
    "Am7", "Dm7", "Em7", "Bm7",
    # Major 7ths
    "Cmaj7", "Fmaj7", "Gmaj7", "Amaj7", "Dmaj7",
    # Suspended and Add
    "Dsus2", "Dsus4", "Asus2", "Asus4", "Esus4", "Gsus4", "Cadd9",
    # Common Barre Chords
    "F", "B", "Bm", "Cm", "Fm", "Gm",
    "F#m", "C#m", "G#m", "D#m", "A#m",
    "F#", "C#", "G#", "D#", "A#",
    "F7", "F#7",
})

# Chords that require a barre finger shape on guitar
BARRE_CHORDS: Final[frozenset[str]] = frozenset({
    "F", "B", "Bm", "Cm", "Fm", "Gm",
    "F#m", "C#m", "G#m", "D#m", "A#m",
    "F#", "C#", "G#", "D#", "A#",
    "F7", "F#7", "Bm7",
})

# Enharmonic mapping: resolve flats to canonical sharp spelling (or vice versa)
ENHARMONIC_EQUIVALENTS: Final[dict[str, str]] = {
    # Major flats to sharps
    "Db": "C#",
    "Eb": "D#",
    "Gb": "F#",
    "Ab": "G#",
    "Bb": "A#",
    # Minor flats to sharps
    "Dbm": "C#m",
    "Ebm": "D#m",
    "Gbm": "F#m",
    "Abm": "G#m",
    "Bbm": "A#m",
    # 7th flats to sharps
    "Db7": "C#7",
    "Eb7": "D#7",
    "Gb7": "F#7",
    "Ab7": "G#7",
    "Bb7": "A#7",
}

# Common naming variations and aliases mapped directly to canonical names
CHORD_ALIASES: Final[dict[str, str]] = {
    # Full words and common abbreviations
    "a minor": "Am",
    "amin": "Am",
    "aminor": "Am",
    "b minor": "Bm",
    "bmin": "Bm",
    "bminor": "Bm",
    "c minor": "Cm",
    "cmin": "Cm",
    "cminor": "Cm",
    "d minor": "Dm",
    "dmin": "Dm",
    "dminor": "Dm",
    "e minor": "Em",
    "emin": "Em",
    "eminor": "Em",
    "f minor": "Fm",
    "fmin": "Fm",
    "fminor": "Fm",
    "g minor": "Gm",
    "gmin": "Gm",
    "gminor": "Gm",
    # Major variations
    "c major": "C",
    "cmaj": "C",
    "d major": "D",
    "dmaj": "D",
    "e major": "E",
    "emaj": "E",
    "f major": "F",
    "fmaj": "F",
    "g major": "G",
    "gmaj": "G",
    "a major": "A",
    "amaj": "A",
    "b major": "B",
    "bmaj": "B",
    # 7th variations
    "a dominant 7": "A7",
    "adom7": "A7",
    "b dominant 7": "B7",
    "bdom7": "B7",
    "c dominant 7": "C7",
    "cdom7": "C7",
    "d dominant 7": "D7",
    "ddom7": "D7",
    "e dominant 7": "E7",
    "edom7": "E7",
    "g dominant 7": "G7",
    "gdom7": "G7",
    # Minor 7th aliases
    "a minor 7": "Am7",
    "amin7": "Am7",
    "d minor 7": "Dm7",
    "dmin7": "Dm7",
    "e minor 7": "Em7",
    "emin7": "Em7",
    "b minor 7": "Bm7",
    "bmin7": "Bm7",
    # Major 7th aliases
    "c major 7": "Cmaj7",
    "c major7": "Cmaj7",
    "c-maj7": "Cmaj7",
    "f major 7": "Fmaj7",
    "f major7": "Fmaj7",
    "g major 7": "Gmaj7",
    "g major7": "Gmaj7",
    # Suspended and Add aliases
    "d sus 2": "Dsus2",
    "dsus 2": "Dsus2",
    "d sus 4": "Dsus4",
    "dsus 4": "Dsus4",
    "a sus 2": "Asus2",
    "asus 2": "Asus2",
    "a sus 4": "Asus4",
    "asus 4": "Asus4",
    "c add 9": "Cadd9",
    "cadd 9": "Cadd9",
}


def is_barre_chord(chord_name: str) -> bool:
    """Return True if the canonical chord requires a barre fingering shape."""
    return chord_name in BARRE_CHORDS


def normalize_chord(raw_chord: str) -> str:
    """Normalize a raw chord string into its canonical chord name.

    Steps:
    1. Strip leading and trailing whitespace.
    2. Strip slash chord bass notes (for example 'G/B' becomes 'G', 'D/F#' becomes 'D').
    3. Check exact match against canonical set.
    4. Check alias dictionary (case-insensitive).
    5. Resolve enharmonics (flats to sharps).
    6. Verify final result against CANONICAL_CHORDS.
    7. If not recognized, raise UnknownChordError.
    """
    if not raw_chord or not raw_chord.strip():
        raise UnknownChordError(raw_chord)

    cleaned = raw_chord.strip()

    # Handle slash chords: guitarists form the base chord shape, bass note is played by bassist
    if "/" in cleaned:
        cleaned = cleaned.split("/", 1)[0].strip()

    # Exact canonical match
    if cleaned in CANONICAL_CHORDS:
        return cleaned

    # Check case-insensitive alias lookup
    lower_cleaned = cleaned.lower()
    if lower_cleaned in CHORD_ALIASES:
        target = CHORD_ALIASES[lower_cleaned]
        if target in CANONICAL_CHORDS:
            return target

    # Title-case / capitalization adjustment (e.g. 'am' -> 'Am', 'c' -> 'C', 'dsus4' -> 'Dsus4')
    capitalized_candidates = [
        cleaned.capitalize(),
        cleaned[0].upper() + cleaned[1:] if len(cleaned) > 1 else cleaned.upper(),
    ]

    for candidate in capitalized_candidates:
        if candidate in CANONICAL_CHORDS:
            return candidate
        # Check enharmonics
        if candidate in ENHARMONIC_EQUIVALENTS:
            resolved = ENHARMONIC_EQUIVALENTS[candidate]
            if resolved in CANONICAL_CHORDS:
                return resolved

    # Direct enharmonic check on raw cleaned
    if cleaned in ENHARMONIC_EQUIVALENTS:
        resolved = ENHARMONIC_EQUIVALENTS[cleaned]
        if resolved in CANONICAL_CHORDS:
            return resolved

    # If still not found, raise validation error
    raise UnknownChordError(raw_chord)
