# Milestone 1: verified dataset exploration

Audit/implementation date: 14 November 2026. No training began until inventory,
EDA outputs and preprocessing tests passed.

Dataset: [rodriler/isolated-guitar-chords](https://huggingface.co/datasets/rodriler/isolated-guitar-chords),
revision `07371b25b9cdd830638c4ffd5ed8b8a150d7f696`. Repository metadata declares CC BY 4.0.
Attribution: Isolated Guitar Chords by rodriler (derived from severyn-k), CC BY 4.0; https://huggingface.co/datasets/rodriler/isolated-guitar-chords. Changes: decoding, resampling, activity crop, feature extraction.

## Verified inventory

- 780 WAV files: 633 train, 147 official test, 25 labels.
- 612 cached files were preserved; only the missing 168 were downloaded.
- Every audio file passed expected byte-size and source SHA256 verification.
- No missing, unreadable, malformed, conflicting-label or exact decoded-PCM duplicate files were found.
- No exact PCM duplicates cross the official splits. Related takes can still share source characteristics.
- Sample rates: 777 at 44,100 Hz; 1 at 48,000 Hz; 2 at 16,000 Hz.
- Channels: 747 mono, 33 stereo. Subtypes: 779 PCM16, 1 PCM24.
- Train duration: 3.851?51.200 s; median 5.567 s.
- Test duration: 5.009?60.797 s. Long recordings belong to Noise.
- 65 recordings have more than 1% clipped samples: 50 train, 15 test. Retained and flagged; no attempted reconstruction of lost samples.

| Label | Train | Official test |
|---|---:|---:|
| A | 25 | 6 |
| A# | 25 | 6 |
| A#m | 25 | 6 |
| Am | 40 | 6 |
| B | 25 | 6 |
| Bm | 25 | 6 |
| C | 25 | 6 |
| C# | 25 | 6 |
| C#m | 25 | 6 |
| Cm | 25 | 6 |
| D | 25 | 6 |
| D# | 25 | 6 |
| D#m | 25 | 6 |
| Dm | 25 | 6 |
| E | 40 | 6 |
| Em | 25 | 6 |
| F | 25 | 6 |
| F# | 25 | 6 |
| F#m | 25 | 6 |
| Fm | 25 | 6 |
| G | 25 | 6 |
| G# | 25 | 6 |
| G#m | 25 | 6 |
| Gm | 25 | 6 |
| Noise | 3 | 3 |

## Findings and decisions

The extra Am/E examples are 15 GarageBand recordings in each class. The dataset
card's balanced-count description is incomplete. Noise has only three original
recordings per split, so window count must never be confused with independent
source count. All 24 chord labels normalize to Python canonical names; D#m lacks
frontend fingering data and must be reported unsupported during integration.

Waveforms show that the first spectral-flux onset can be an incidental handling
sound. A class-independent activity crop instead uses 20 ms RMS frames, an
absolute 0.003 floor and 10% of peak RMS, with 40 ms pre-roll. This alters crop
position without independently peak-normalizing Noise. Absent activity remains
explicit; quiet recordings are retained rather than fabricated into loud signals.

All Log-Mel comparisons use one absolute power reference (1), a common -100 to
+30 dB range, and the same waveform transform. The two-second window retains
median 86.6% of post-crop chord energy;
three seconds retains 94.7%. Duration was
then selected using validation performance, not test performance. CQT and chroma
remain diagnostic alternatives; we do not claim Mel is experimentally superior.

The validation split is frozen at the original-recording level before derived
windows: 506 train, 127 validation. No reliable session identifiers exist; source,
player and guitar correlation cannot be excluded. Test waveforms were inspected
for integrity; tuning and representative EDA figures use training audio only.

## Saved evidence

- `ml/data/remote_inventory.json`: pinned remote paths, sizes and checksums.
- `ml/data/dataset_inspection_report.json`: all 780 recording-level measurements.
- `ml/data/eda_output/invalid_samples.json`: empty invalid-file report.
- `ml/data/eda_output/canonical_compatibility.json`: frontend/backend mapping.
- `ml/data/eda_output/window_comparison.json`: training-only energy comparison.
- Seven PNG figures: class counts, duration/sample rate, waveforms/onsets,
  onset distributions, chord/noise, two/three-second Mel, Mel/CQT/chroma.
- `ml/notebooks/01_eda.ipynb`: executed with saved plots and numerical outputs.

Raw data/output directories stay Git-ignored. Original takeover scripts and
notebook are preserved under `scratch/ml_takeover_20261114_200516/`.
