# Kaggle Song Import Report: Chordly

## Summary
- **Rows read from raw CSV files**: 3292
- **Unique songs after deduplication by (title, artist)**: 327
- **Valid songs accepted into catalogue**: 187
- **Total songs rejected**: 140
- **Capo data handling**: The source dataset contains no capo column; `capo_fret` is set to null.
- **Lyrics hygiene**: All lyrics columns were dropped immediately on load. No lyrics exist in output.

## Genre Distribution
| Genre | Song Count |
|:------|:-----------|
| Country | 24 |
| Hiphop | 44 |
| Pop | 45 |
| Rnb | 23 |
| Rock | 51 |

## Rejections by Reason
| Reason | Count |
|:-------|:------|
| More than 7 distinct chords | 31 |
| Chord missing fingering (D#m) | 6 |
| Unknown chord (the) | 4 |
| Unknown chord (G6) | 4 |
| Unknown chord (C#m7) | 3 |
| Unknown chord (Cm6) | 2 |
| Unknown chord (A5) | 2 |
| Unknown chord (is) | 2 |
| Unknown chord (4x) | 2 |
| Unknown chord (Fsus2) | 2 |
| Unknown chord (Gsus) | 2 |
| Fewer than 3 distinct chords | 2 |
| Unknown chord (Cm7) | 2 |
| Unknown chord (=) | 1 |
| Unknown chord (Eb-D-D-C) | 1 |
| Unknown chord (Dadd9) | 1 |
| Unknown chord (Bbmaj7) | 1 |
| Unknown chord (Esus2) | 1 |
| Unknown chord (A9) | 1 |
| Unknown chord (like) | 1 |
| Unknown chord (F6) | 1 |
| Unknown chord (%) | 1 |
| Unknown chord (x-x-4-2-3-x) | 1 |
| Unknown chord (:320033) | 1 |
| Unknown chord (hits) | 1 |
| Unknown chord (fade) | 1 |
| Unknown chord (Am6) | 1 |
| Unknown chord (Dadd11) | 1 |
| Unknown chord (x16) | 1 |
| Unknown chord (Emaj7) | 1 |
| Unknown chord (out) | 1 |
| Unknown chord (as) | 1 |
| Unknown chord (weeks) | 1 |
| Unknown chord (again) | 1 |
| Unknown chord (C#5) | 1 |
| Unknown chord (2x) | 1 |
| Unknown chord (with) | 1 |
| Unknown chord (--4--) | 1 |
| Unknown chord (throughout) | 1 |
| Unknown chord (Cm9) | 1 |
| Unknown chord (of) | 1 |
| Unknown chord (F#dim) | 1 |
| Unknown chord (Palm) | 1 |
| Unknown chord (?) | 1 |
| Unknown chord (once) | 1 |
| Unknown chord (D5) | 1 |
| Unknown chord (Ebaug) | 1 |
| Unknown chord (C#dim) | 1 |
| Unknown chord (Am7b5) | 1 |
| Unknown chord (vision) | 1 |
| Unknown chord (part) | 1 |
| Unknown chord (strums) | 1 |
| Unknown chord (Bsus4) | 1 |
| Unknown chord (deny) | 1 |
| Unknown chord (Gadd9) | 1 |
| Unknown chord (strum) | 1 |
| Unknown chord (C#7) | 1 |
| Unknown chord (dress) | 1 |
| Unknown chord (Aadd9) | 1 |
| Unknown chord (F13) | 1 |
| Unknown chord (3) | 1 |
| Unknown chord (years) | 1 |
| Unknown chord (4) | 1 |
| Unknown chord (money) | 1 |
| Unknown chord (slide)Em) | 1 |
| Unknown chord (Esus) | 1 |
| Unknown chord (C#9) | 1 |
| Unknown chord (2) | 1 |
| Unknown chord (Keep) | 1 |
| Unknown chord (chords:) | 1 |
| Unknown chord (Bbmadd11(#5) | 1 |
| Unknown chord (Bm9) | 1 |
| Unknown chord (solar) | 1 |
| Unknown chord (three) | 1 |
| Unknown chord (to) | 1 |
| Unknown chord (Hold) | 1 |
| Unknown chord (Gsus2) | 1 |
| Unknown chord (A7sus4) | 1 |
| Unknown chord (D4) | 1 |
| Unknown chord (hold) | 1 |
| Unknown chord (F#m11) | 1 |
| Unknown chord (Note:) | 1 |
| Unknown chord (Am9) | 1 |
| Unknown chord (Bbdim7) | 1 |
| Unknown chord (Gm7) | 1 |
| Unknown chord (Csus2) | 1 |
| Unknown chord (D#m7) | 1 |
| Unknown chord (E5) | 1 |
| Unknown chord (background) | 1 |

## Spot Check: 10 Random Songs (Chords Only, No Lyrics)
| Title | Artist | Genre | Difficulty | Chords |
|:------|:-------|:------|:-----------|:-------|
| MY KIND OF WOMAN | Mac DeMarco | rock | 5 | Am, Bm, C, D, Em, G |
| CANT HOLD US | Macklemore | hiphop | 5 | Bm, C, D, Dsus4, Em, G |
| HALLELUJAH | Jeff Buckley | country | 3 | B7, C, D, Em, G |
| ALL THE GOOD GIRLS GO TO HELL | Billie Eilish | pop | 2 | Am, B7, C, Em |
| TRUCE | twenty one pilots | hiphop | 5 | B7, C, Cm, D, Em, G |
| TEAR IN MY HEART | twenty one pilots | hiphop | 5 | A, A7, Bm, D, F#, F#m, G |
| FEELING WHITNEY | Post Malone | hiphop | 5 | Am, C, C7, F, Fmaj7, G, G7 |
| BED OF LIES | Nicki Minaj feat. Skylar Grey | hiphop | 2 | C, D, Em, G |
| SKINNY LOVE | Birdy | rock | 4 | Am, C, Dm, Em, F |
| BELIEVER | Imagine Dragons | rock | 4 | Am, E, E7, F, G |
