# Frozen model evaluation

Date: 14 November 2026. Both models are trained locally. CNN weights are random
initializations; no pretrained chord weights or external recognition API is used.

## Protocol

633 official training recordings were split once (seed 42) into 506 training and
127 validation originals. All windows from an original stay in its partition.
No official test data fit a scaler, standardization statistics, model, duration,
hyperparameter or rejection threshold. After selection, the two models were each
evaluated once on 147 official-test recordings. Re-running `evaluate.py` reads
saved results when hashes match and rejects changed artifacts.

SVM: training-only StandardScaler, 88 aggregate features, RBF kernel, C=10,
gamma=0.001, balanced class weights. Twelve duration/C/gamma candidates were
compared on the same validation split; selected duration is 3 seconds.

CNN: 157,945 parameters; 128-band Log-Mel, 2,048 FFT, 512 hop, 22,050 Hz,
3-second windows (128 x 130). Per-band standardization uses training only.
AdamW, learning rate 0.001, batch 16, inverse-square-root class weights, no
augmentation. Full-precision CUDA training used about 151 MiB peak allocated
tensor memory. Best epoch 27; early stopping after epoch 42 of a
maximum 80. Optimizer, RNG and loader state are saved for resume. An isolated
checkpoint-copy test verified resume without changing the evaluated weights.

## Measured results

| Model / split | Accuracy | Macro precision | Macro recall | Macro F1 |
|---|---:|---:|---:|---:|
| SVM validation (selection) | 96.06% | ? | ? | 0.9615 |
| CNN validation (selection) | 99.21% | ? | ? | 0.9919 |
| SVM official test | 90.48% | 0.9302 | 0.9067 | 0.8998 |
| CNN official test | 87.76% | 0.8746 | 0.8733 | 0.8591 |

**The SVM performs better on this official test.** A CNN is not inherently better
than a traditional model. Validation selection results are optimistic and do not
establish performance on a different guitar/player/microphone.

Noise recall: SVM 3/3; CNN 2/3. Neither model labelled an actual test chord as
Noise. Three Noise examples are far too few for a robust noise-rejection claim.
Each source contributes one fixed window to these reported metrics.

## Errors, confidence and limits

The CNN missed all six D test recordings, often predicting Dm. It also confused
4/6 F# recordings with F#m. Other errors include A/Am, B/Bm, G#m/G#, Em/F,
C#m/F#, and one Noise recording accepted as Am. A chroma diagnostic of D/Dm and
F#/F#m retains the expected major/minor-third distinction; it does not support
changing the ground-truth labels. Voicing/tuning/acquisition shift and learned
source shortcuts are plausible explanations, not proven causes.

The validation-selected threshold is 0.30. It accepted 126/127 validation
recordings with 99.21% observed accuracy on accepted predictions. On official
test it accepted 139/147, with 87.05%
accuracy among accepted recordings. It therefore did **not** filter mistakes
adequately. Scores remain uncalibrated; no 95% real-world guarantee is claimed.
Six D#m predictions were correctly reported unsupported by the current frontend
catalog; two recordings were classified Noise. Manual confirmation is mandatory.
The threshold and models were not retuned after observing these test results.

65 source recordings have more than 1% clipped samples. Exact PCM hashes found
no duplicate leakage, but correlated sessions/source characteristics remain.
Only two original Noise recordings fit the training partition and one appears in
validation. Neither more windows nor class weighting creates independent data.

## Artifacts and independent next test

`ml/artifacts/baseline/`: model, candidate metrics, feature/config metadata,
validation report/confusion matrix. `ml/artifacts/cnn/`: best weights, resumable
checkpoint, config, training history, curves, validation scores and threshold.
`ml/artifacts/evaluation/`: both full class reports, confusion matrices, all
147 prediction records, artifact hashes and diagnostic chroma/error reports.

No personal-guitar data has been trained on or evaluated. Use
`evaluate_personal.py` with a separate labelled holdout and preserve the first
results. The local UI is marked Experimental. Browser/native automation was
unavailable, so physical microphone and rendered confirmation flow verification
remain pending. HTTP integration, WAV encoding, API boundaries and production
feature gates are separately tested; these do not replace a real microphone test.
