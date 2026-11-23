# Local chord-recognition fine-tuning pilot

On 23 November 2026, a copy of Chordly's CNN completed 12 CUDA epochs using
public audio. The parent checkpoint hash matches the original ONNX export.
The hosted release uses the second candidate described below. Both evaluations
used the original recognition threshold of 0.30,
preprocessing, activity gate and supported-chord list.

| Held-out input | Original CNN | Fine-tuned CNN |
| --- | ---: | ---: |
| Fan windows accepted as a chord (lower is better) | 16 / 24 | 0 / 24 |
| Clean chords returned correctly | 103 / 222 | 214 / 222 |
| Quiet chords returned correctly | 89 / 222 | 212 / 222 |
| Quiet chords mixed with fan audio returned correctly | 33 / 222 | 160 / 222 |

The fan test used three independent Freesound recordings. All 16 false accepts
came from one tower-fan recording, and all were F. Both models rejected the
seven windows from the quiet-room ceiling fan and the single window from the
remaining recording. The 222 chord segments came from two held-out GuitarSet
players. Clean, quiet and mixed rows use the same underlying performances.
Rejections and wrong chords both count as misses. On mixed audio the candidate
returned 160 correct chords, nine wrong chords and 53 rejections.

Training used three other guitarists, four other fan recordings and 506 original
training examples. A fourth guitarist, two other fan recordings and 127 original
validation examples were used for checkpoint selection. Epoch 12 had the best
mean validation top-1 accuracy across the five input conditions. On the original
validation set alone, top-1 accuracy fell from 126/127 to 123/127. That split
contributed to model selection. The original official test set was excluded.

This pilot measures held-out players and fan sources within these collections.
The guitar-plus-fan clips are digital mixtures. Evidence from additional public
fan sources and independent single-strum recordings would help establish how
well the model generalizes before a release decision.

See the [local experiment instructions](../README.md#local-public-data-fine-tuning-experiment).
Full predictions and the training history are in `ml/artifacts/fan-pilot-01/`.
Four reusable public-audio WAVs are in `ml/data/public-tunerobust/demo/`.
The saved candidate correctly returned F for the clean, quiet and mixed F
examples and returned Noise for the standalone tower fan.

Guitar audio is excerpted and modified from [GuitarSet v1.1.0](https://zenodo.org/records/3371780)
by Xi, Bittner, Pauwels, Ye and Bello (CC BY 4.0). The nine CC0 Freesound
preview sources, creators and checksums are recorded in `fans.json` and copied
into the experiment manifest.

## Second local pilot for quiet chords with fan noise

The first pilot returned the correct chord on 43/81 mixtures at 3 dB guitar-to-fan
ratio, 57/74 at 9 dB and 60/67 at 15 dB. Across all 222 mixtures it labelled 32
as Noise and rejected 21 for low confidence.

`ml/scripts/refine_mixed.py` starts from the first candidate. Each training chord
gets six additional mixtures at −3, 0, 3, 6, 9 and 15 dB with randomly selected
training fan crops. Chord attenuation varies from 9 to 21 dB. Training gives
mixed clips twice the sampling weight of each other condition and uses a fresh
optimizer with a learning rate of 0.00005. The recognition threshold stays at 0.30.
Checkpoint selection maximizes correct mixed validation decisions subject to
limits on fan false accepts, incorrect chord returns, clean and quiet chord
recognition and original validation accuracy. Validation selected epoch 8.

| Count | First candidate | Second candidate |
| --- | ---: | ---: |
| Correct on the same 222 mixed chords | 160 | 174 |
| Wrong chord returned on those mixtures | 9 | 11 |
| Correct on 222 mixtures with three new fan sources | 189 | 199 |
| Wrong chord returned on those new mixtures | 9 | 11 |
| False accepts on the original / new 24 fan-only windows | 0 / 0 | 0 / 0 |
| Correct on the original 127 validation recordings (top-1) | 123 | 122 |

The second candidate reached 49/81, 63/74 and 62/67 on the original 3, 9
and 15 dB mixtures. This repeat benchmark informed the experiment design.
The separate check uses the same two held-out guitarists and three CC0 fan
recordings that neither candidate used for training or selection:
[TimBahrij](https://freesound.org/people/TimBahrij/sounds/191580/),
[Saltbearer](https://freesound.org/people/Saltbearer/sounds/481997/), and
[Sadiquecat](https://freesound.org/people/Sadiquecat/sounds/814917/).
It tests transfer to new noise sources with the same guitar recordings.

Run `ml/scripts/refine_mixed.py` with the local ML Python environment to reproduce
the training (use a fresh `--output` directory). The second checkpoint, selection
history, repeat benchmark and separate fan comparison are under
`ml/artifacts/fan-pilot-02/`.

## Independent phone recordings

The next check used [Klangio's real acoustic guitar performances](https://github.com/Klangio/guitar-strumming-transcription/tree/929e403f3256b055c1eea27064ae39f36905359e/dataset/klangio-gst-mm-2025).
The [dataset paper](https://arxiv.org/abs/2508.07973) describes how the authors recorded three players and annotated the strums. We chose takes 01, 06, 11, 16, 21 and 28 in each of the 1000, 2000 and 4000 series before scoring. The three frozen models used the original preprocessing and 0.30 threshold. These recordings played no part in training, checkpoint selection or threshold setting.

| Test | Original CNN | First candidate | Second candidate |
| --- | ---: | ---: | ---: |
| Correct on original phone audio | 118 / 333 | 293 / 333 | 296 / 333 |
| Correct after reducing guitar level by 15 dB | 69 / 333 | 292 / 333 | 295 / 333 |
| Correct with guitar 3 dB above fan | 171 / 999 | 484 / 999 | 647 / 999 |
| Wrong chord returned on the same mixes | 203 / 999 | 41 / 999 | 62 / 999 |
| No chord returned on the same mixes | 625 / 999 | 474 / 999 | 290 / 999 |
| Chord returned on fan-only controls | 16 / 24 | 0 / 24 | 0 / 24 |

There were 333 non-overlapping passages covering 11 chord labels in 18 takes. Each excerpt starts 50 ms after a labelled chord onset and ends before the next chord change or at three seconds. A passage needed at least one second of annotation and an original RMS of at least 0.003. Each quiet passage was mixed separately with each of the three previously held-out fans at the same +3 dB RMS ratio. The 999 mixes share those 333 performances. The 24 fan-only controls reuse the earlier benchmark.

The second candidate returned 163 additional correct chords and 21 additional wrong chords on the mixes. Its correct count ranged from 143/333 to 300/333 across the three fans. This supports better transfer to these phone performances. Quiet playing in a room with an actual fan remains unverified.

To repeat locally with the ML environment and cached pilot fans, run `python ml/scripts/fetch_klangio_holdout.py` and then `python ml/scripts/evaluate_klangio_holdout.py` from the repository root. The first command verifies source files against Git blob hashes at the pinned revision. Results in `ml/artifacts/klangio-holdout/` include per-clip decisions, mix offsets, model hashes and thresholds.
