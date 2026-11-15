# Chordly ML — Guitar Chord Recognition

This module contains our independently trained isolated-guitar-chord recognition
prototype. Local FastAPI integration and a Next.js recording interface are
implemented. A CPU-only ONNX export and dedicated hosted FastAPI service are
configured in `frontend/audio_backend/`; see the root README for deployment.
Physical microphone/browser verification and evaluation on your own guitar
remain pending.

## Measured status (14 November 2026)

The pinned dataset contains **780 WAV recordings**, **25 labels**, **633 training**
and **147 official test** recordings. Training is split into 506 train / 127
validation recordings before any derived windows are produced. The complete EDA
notebook has saved execution outputs; the original takeover files are preserved
under `scratch/ml_takeover_20261114_200516/`.

| Model | Validation accuracy | Official test accuracy | Test macro F1 |
|---|---:|---:|---:|
| SVM (88 aggregate features) | 96.06% | 90.48% | 0.8998 |
| Custom CNN (157,945 parameters) | 99.21% | 87.76% | 0.8591 |

**The SVM performs better on the official test set.** The CNN is the experimental
local recognition model requested for this feature; high softmax scores can be
wrong. It missed every official-test D recording and rejected only 2 of 3 Noise
recordings. Do not present these results as reliable real-world recognition.
All model choices and the threshold were frozen before the one final test run.

Read [LEARNING_GUIDE.md](LEARNING_GUIDE.md),
[reports/milestone_1.md](reports/milestone_1.md), and
[reports/model_evaluation.md](reports/model_evaluation.md).

## Run the existing local feature

From the repository root, in terminal 1:

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/serve_api.py
```

This binds to `127.0.0.1:8100`, enables the audio route locally, and uses a separate
SQLite catalog under `ml/data/`. It does not connect to the production database.

In terminal 2:

```powershell
cd frontend
$env:NEXT_PUBLIC_ENABLE_AUDIO_ML="true"
$env:NEXT_PUBLIC_ML_API_URL="http://127.0.0.1:8100"
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100/app`. Record one strum, play it back, submit, and
confirm the result. Only confirmation updates the existing known-chords list.
WAV upload is available for repeatable checks. Uploaded audio is not persisted.
Use Ctrl+C in each terminal to stop. These flags configure local development only. Production uses the same-origin
`/api/audio/predict-chord` service and permits microphone access for the site.
The original catalogue backend keeps its development-only audio route gate.

## Reproduce the experiment

Use the existing interpreter explicitly. Do not reinstall the working CUDA stack.
On a fresh environment only, install PyTorch 2.5.1/torchvision 0.20.1/torchaudio
2.5.1 from the cu121 index first, then install `requirements-lock.txt`. Optional
API dependencies are in `requirements-api.txt`; all installs belong in `ml/.venv`.

From the repository root:

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/verify_environment.py
.\ml\.venv\Scripts\python.exe ml/scripts/download_dataset.py
.\ml\.venv\Scripts\python.exe ml/scripts/inspect_dataset.py
.\ml\.venv\Scripts\python.exe ml/scripts/run_eda.py
.\ml\.venv\Scripts\python.exe ml/scripts/execute_notebook.py ml/notebooks/01_eda.ipynb
.\ml\.venv\Scripts\python.exe -m pytest ml/tests -q
.\ml\.venv\Scripts\python.exe ml/scripts/preprocess_all.py
```

The downloader reuses verified cached files and downloads missing files only.
It never silently replaces a corrupt cache file. SoundFile reads WAV audio;
`datasets.Audio`, torchcodec, FFmpeg and pretrained weights are not used.

On a fresh experiment with no existing model artifacts, continue sequentially:

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/train_baseline.py
.\ml\.venv\Scripts\python.exe ml/scripts/train_cnn.py --epochs 80 --batch-size 16 --patience 15
.\ml\.venv\Scripts\python.exe ml/scripts/evaluate.py
```

Training commands protect existing artifacts. Use `--resume` to continue an
interrupted CNN run, or `--output <new-directory>` for a separate CNN experiment.
Do not tune against the already-consumed official test set. `evaluate.py` returns
the existing result if artifact hashes match and refuses changed artifacts.
All metrics, class reports, configuration, split assignments, checkpoints and
confusion matrices are saved under ignored `ml/data/` and `ml/artifacts/`.

For your independent guitar test, collect 1–3 second WAVs as
`ml/data/personal_recordings/<true-chord>/*.wav`, including Noise. Use Save WAV in
the local recording panel, label the actual chord before viewing predictions,
and keep these recordings outside the
public training manifest, then run:

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/evaluate_personal.py ml/data/personal_recordings --output ml/data/personal_initial.json
```

This never trains on personal recordings and refuses to overwrite initial results.

## Goal

A user plays a single guitar chord on their microphone. The system predicts
which chord is being played and optionally adds it to their known-chords list,
which the existing Chordly recommendation engine uses to suggest songs.

## Approach

1. **Input:** WAV audio (2–3 seconds of active audio after silence trimming)
2. **Feature:** Log-Mel spectrogram (128 × T) treated as a grayscale image
3. **Baseline model:** SVM with hand-crafted audio features (MFCC, chroma)
4. **Main model:** Custom CNN trained from scratch using PyTorch (no pretrained weights)
5. **Local integration:** FastAPI endpoint `POST /audio/predict-chord`

## Dataset

**rodriler/isolated-guitar-chords**
- Source: https://huggingface.co/datasets/rodriler/isolated-guitar-chords
- Derived from: `severyn-k/isolated-guitar-chords`
- License: **CC BY 4.0** (Creative Commons Attribution 4.0 International)

**Attribution (required by CC BY 4.0):**
> Dataset: *Isolated Guitar Chords* by rodriler (sourced from severyn-k),
> licensed under CC BY 4.0.
> Available at: https://huggingface.co/datasets/rodriler/isolated-guitar-chords

**Known limitations:**
- Recorded with a single Fender FA-15 3/4 acoustic guitar
- Recorded by a single player
- The model may not generalize to electric guitars, full-size acoustics,
  different playing styles, or different microphone environments
- Personal-guitar generalization is a separate holdout workflow, pending recordings

## Module Structure

```
ml/
├── requirements.txt          ← ML-specific Python dependencies (separate venv)
├── requirements-lock.txt     ← Actual tested environment, including CUDA versions
├── data/
│   ├── raw/                  ← Downloaded dataset (NOT committed — see .gitignore)
│   └── processed/            ← Preprocessed .npy arrays (NOT committed)
├── notebooks/
│   ├── 01_eda.ipynb          ← Stage 1: Dataset exploration
│   ├── 02_preprocessing.ipynb ← Stage 2: Pipeline development + visualization
│   ├── 03_baseline.ipynb     ← Stage 3: SVM / Random Forest
│   ├── 04_cnn_training.ipynb ← CNN configuration and learning curves
│   └── 05_evaluation.ipynb   ← Frozen official-test results and limitations
├── src/
│   ├── preprocessing/        ← load_audio, trim, pad_or_crop, normalize, mel
│   ├── features/             ← chroma, MFCC, CQT feature extractors
│   ├── models/               ← ChordCNN (PyTorch) + SVM/RF wrappers
│   ├── training/             ← Training loop, validation, early stopping
│   ├── evaluation/           ← Accuracy, F1, confusion matrix
│   └── inference/            ← Saved CNN loading + shared preprocessing
├── scripts/
│   ├── verify_environment.py ← Check CUDA and package installation
│   ├── inspect_dataset.py    ← Verify dataset contents vs. documentation
│   ├── preprocess_all.py     ← Run pipeline, save X/y arrays
│   ├── train_baseline.py     ← Train SVM, save model
│   ├── train_cnn.py          ← Train CNN, save checkpoint
│   └── evaluate.py           ← Load model, run on test split, print report
├── artifacts/                ← Saved models (NOT committed)
└── tests/                    ← Unit tests for preprocessing + inference
```

## Original setup outline (fresh environments only)

```bash
# 1. Create a virtual environment inside ml/
cd ml
py -3.12 -m venv .venv
.venv\Scripts\activate        # Windows

# 2. Install dependencies (CUDA 12.1 — RTX 3050)
pip install -r requirements.txt

# 3. Verify environment
python scripts/verify_environment.py

# 4. Inspect the dataset
python scripts/inspect_dataset.py
```

## Development Stages

| Stage | Milestone | Status |
|-------|-----------|--------|
| M1 | Dataset inventory + executed EDA | Complete |
| M2 | Shared audio preprocessing | Complete and tested |
| M3 | Log-Mel + aggregate features | Complete and tested |
| M4 | SVM baseline | Trained and evaluated |
| M5 | Custom CNN | Trained from random weights on CUDA |
| M6 | Evaluation + model comparison | Frozen official-test results saved |
| M7 | Personal-guitar generalization | Workflow ready; recordings/results pending |
| M8 | Local FastAPI integration | HTTP and validation tests passed |
| M9 | Local frontend mic UI | Implemented; physical browser/mic verification pending |

## Evaluation Metrics (to be reported after training)

- Accuracy
- Macro Precision, Recall, F1
- Confusion matrix (per-class)
- Noise rejection accuracy
- Generalization gap (val vs. test accuracy)

> **No accuracy numbers are claimed until the model has been trained and
> evaluated on the official test split.**
