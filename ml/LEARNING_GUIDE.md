# How this ML feature works

## Dataset exploration comes first

A label is the correct class attached to a recording. We verified 24 chord labels
and one Noise label, rather than setting the output size from the dataset card.
An inventory records every source path, byte count, checksum, audio format and
label. Checksums catch incomplete downloads; PCM hashes also catch identical
decoded audio stored with different filenames. Neither proves the labels are
correct or that two takes are acoustically independent.

The source card's 25-training-recordings-per-chord description has exceptions:
Am and E include 15 GarageBand recordings each. Noise has only 3 source recordings
per split. Some F/G audio is clipped: the waveform hits the recording limit,
which loses information and can introduce class-specific artifacts. We preserve
and flag it; we do not pretend we can reconstruct the lost signal.

Run `inspect_dataset.py` and `run_eda.py`, then read the saved figures and executed
`01_eda.ipynb`. Seven figures and a JSON report make the conclusions inspectable.

## Waveforms and reproducible preprocessing

A waveform is an array of amplitudes sampled regularly in time. At 22,050 Hz,
three seconds contains 66,150 samples. SoundFile reads the original WAV without
Hugging Face's version-dependent audio decoder. Stereo channels are averaged,
and polyphase resampling standardizes sample rate while filtering aliasing.

RMS measures local signal energy. Activity detection uses 20 ms frames, an
absolute floor of 0.003 and 10% of the maximum frame RMS. This avoids triggering
on many quiet pre-strum sounds. We retain 40 ms before the detected activity,
crop to a fixed duration and zero-pad short recordings. A first-onset detector
can trigger on handling sounds, so its output must be compared with waveforms.

The same `prepare_audio` function processes every label and live inference.
There is no hidden label-dependent trim that inference could not reproduce.
Quiet Noise is not independently boosted to full scale. If activity is absent,
the beginning of the recording is retained. All-silent input remains silent.

EDA compares two/three-second retained energy; SVM validation compares both
durations. The three-second candidate wins on validation. The official test set
does not choose this parameter. Tests check resampling, stereo averaging,
padding, activity alignment, corrupt input and preserved quiet amplitudes.

## From audio to features

The short-time Fourier transform (STFT) measures frequency energy over short,
overlapping waveform windows. A Mel filter bank groups frequencies; logarithmic
compression turns power into decibels. Our CNN receives 128 Mel bands by 130
time frames for a three-second window, using FFT size 2,048 and hop 512.

Decibels require a reference. Using each sample's own maximum would make quiet
noise look as loud as a chord. We instead use power reference 1 and a fixed
-100 to +30 dB clipping range. CNN standardization subtracts each Mel band's
training-only mean and divides by its training-only standard deviation. Those
statistics are saved and reused at inference. Validation/test data never fit them.

CQT uses musical frequency spacing; chroma collapses octaves into 12 pitch
classes. They are useful diagnostics. Our initial CNN stays with Log-Mel.

## Why an SVM baseline matters

The SVM receives 88 statistics: MFCC/chroma/spectral-contrast summaries, energy,
zero crossings, spectral centroid, bandwidth and rolloff. Its scaler is fitted
only on training recordings. The RBF kernel learns nonlinear class boundaries.
C controls the fit/regularization tradeoff; gamma controls how local a boundary
is. We compared 12 duration/C/gamma candidates on one validation split.

Class balancing is justified by actual counts, especially the tiny Noise class.
It changes the cost of mistakes, not the number of independent examples. The
best validation score is optimistically biased by candidate selection, which is
why the frozen official test result matters. Our SVM beats our CNN on that test.

## Our CNN and training loop

`ChordCNN` has 157,945 randomly initialized parameters. Three convolution blocks
learn local frequency/time patterns. ReLU introduces nonlinearity; batch
normalization stabilizes activations; pooling reduces feature-map size. A mean
over time retains absolute frequency position, which matters for chord pitch.
The classifier uses a 128-unit hidden layer and dropout before 25 output logits.

Logits are unnormalized class scores. CrossEntropyLoss includes the appropriate
log-softmax internally; applying softmax before it is unnecessary. AdamW updates
weights from gradients and adds weight decay. The loss uses inverse-square-root
training class frequencies. Initial training uses no pitch shifting, pretrained
weights, external AI service or augmentation that changes labels.

We trained on CUDA at batch 16 with full precision. Peak allocated GPU tensor
memory was about 151 MiB; this differs from total driver-reserved GPU memory.
Early stopping chose epoch 27 and stopped after epoch 42. Checkpoints preserve
optimizer, RNG and batch-order state. A test resumes an isolated checkpoint copy,
not the model whose test results are already frozen.

The first adaptive-pooling version failed strict CUDA determinism. It was
replaced by an equivalent time mean, and a CUDA backward test now verifies the
operation. Working CUDA-enabled PyTorch was not reinstalled.

## Evaluation and uncertainty

Accuracy is the fraction of recordings classified correctly. Precision asks how
often predictions of a class are correct; recall asks how many true examples of
that class were found. F1 balances precision and recall. Macro averaging gives
each class equal weight, including rare Noise. A confusion matrix shows which
true/predicted pairs account for errors.

The CNN's validation accuracy is 99.21%, but official-test accuracy is 87.76%.
That gap warns of overfitting and acquisition/voicing shifts. It misclassified
all six D test recordings, often as Dm. A chroma diagnostic still distinguishes
the expected major/minor thirds, so the evidence does not justify relabelling
the test set. F# versus F#m is another weakness. The cause is not proven by a
chroma plot; more diverse training data and independent validation are needed.

A softmax score is not a calibrated probability of correctness. A validation
threshold of 0.30 met the small validation sample's acceptance target, but did
not filter the official-test mistakes adequately. We retain this failed
generalization finding rather than tuning the threshold against the test set.
Manual confirmation is mandatory. Noise recall 2/3 is extremely uncertain.

## Local integration and your guitar

The browser captures PCM through an AudioWorklet and encodes mono 16-bit WAV.
FastAPI validates type, size and duration, loads our checkpoint once, and uses
the same preprocessing/features. No user recording is stored permanently.
Silent, Noise, uncertain and unsupported outcomes cannot add a chord. D#m is
recognized as a source class but has no current frontend fingering, so it is
reported unsupported. Existing song matching remains unchanged.

The feature is opt-in in local development and disabled in production. Your
first personal recordings belong in a separate labelled holdout directory.
Record multiple strums on different days, include pauses/noise, and record the
actual chord before looking at predictions. Evaluate once, save initial results,
then discuss improvements. Do not silently mix these recordings into training.

Run commands and exact artifact locations are in README.md. Browser/native
automation was unavailable during implementation, so the physical microphone
and rendered confirmation flow still need a manual check on your computer.
