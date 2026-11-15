# Local implementation checkpoint — 14 November 2026

## Completed

- Pinned, resumed and checksum-verified all 780 dataset WAVs; preserved 612 cached files.
- Finished inventory/EDA, seven plots, JSON diagnostics and saved notebook outputs.
- Implemented/tested shared audio preprocessing, Log-Mel and 88 baseline features.
- Froze 506/127 recording-level train/validation partitions from official training data.
- Trained SVM and our 157,945-parameter CNN from random weights on CUDA.
- Saved best weights, resumable state, configuration, normalization, logs and learning curves.
- Evaluated once on 147 official-test recordings; saved per-class reports and matrices.
- Added a personal-guitar holdout evaluator that never trains or overwrites initial results.
- Added opt-in local FastAPI WAV inference, upload limits, rate limiting, serialized inference,
  cached model loading and unsupported/Noise/silent/uncertain handling.
- Added local Next.js PCM recording, playback, optional WAV saving/upload, prediction scores,
  discard/confirmation and existing known-chords callback integration.
- Verified development CORS/microphone/playback headers and production feature exclusion.
- Executed all five notebooks; no saved notebook errors.

## Actual results

| Model | Official test accuracy | Macro F1 | Noise recall |
|---|---:|---:|---:|
| SVM | 90.48% | 0.8998 | 3/3 |
| CNN | 87.76% | 0.8591 | 2/3 |

The CNN is weaker than the SVM on this test and misses all six D recordings.
Its validation-selected confidence cutoff failed to reject test mistakes well.
Read `model_evaluation.md`; high model scores do not establish real-world accuracy.
No retraining or threshold adjustment used official-test results.

Validation: 35 ML/API tests passed, including CUDA backward, real artifact inference,
preprocessing parity, isolated checkpoint resume, rate limiting and production
route exclusion. Existing backend: 32 tests passed. Browser-side WAV/client/worklet:
3 Node tests passed. TypeScript checks and the Next.js production build passed.
The existing silence-feature test emits a librosa tuning warning; backend tests
emit existing Starlette 422 deprecation warnings. These do not fail tests.

Live HTTP smoke checks returned A as playable input, D#m as unsupported, Noise as
noise, and correct CORS headers. This used public validation WAVs, not personal audio.

## Files created or changed

Existing local ML README, requirements, EDA notebook, inspection/EDA wrappers and
environment checker were extended; the CUDA checker was formatted. Original files
are backed up at `scratch/ml_takeover_20261114_200516/`.

New implementation: `ml/src/dataset.py`, `exploration.py`, and modules under
`preprocessing/`, `features/`, `models/`, `training/`, `evaluation/`, `inference/`;
CLI scripts under `ml/scripts/`; seven test modules under `ml/tests/`;
notebooks 02–05; environment lock/API/dev dependency files; learning guide/reports.

Application files: new `backend/app/audio.py`; a guarded router registration in
`backend/app/main.py`; new `frontend/components/ChordRecognition.tsx`, `lib/audio.ts`,
`public/audio-capture-worklet.js`, `tests/audio.test.mjs`; a guarded panel insertion
in `frontend/app/app/page.tsx`; development-only header rules in `next.config.ts`;
documented opt-in environment examples. Existing matching/catalog files are unchanged.

The pre-existing `.gitignore` modification is preserved byte-for-byte. The existing
untracked exporter and Microsoft cache file were left alone. No files are staged,
committed, pushed, synchronized or deployed. Data/models remain Git-ignored. The
working CUDA PyTorch 2.5.1+cu121 stack is unchanged; added packages live in ml/.venv.

## Remaining verification

The browser access host and native computer-use pipe were unavailable. The actual
rendered recording/permission/confirmation flow and physical microphone have not
been observed. Personal-guitar generalization results are also pending; no such
recordings were supplied or silently added to training.

The temporary verification servers were stopped; production was never accessed.

## Exact next commands/tasks

From the repository root, terminal 1:

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/serve_api.py
```

Terminal 2:

```powershell
cd frontend
$env:NEXT_PUBLIC_ENABLE_AUDIO_ML="true"
$env:NEXT_PUBLIC_ML_API_URL="http://127.0.0.1:8100"
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100/app`. Check microphone permission denied/allowed,
record/stop/auto-stop, playback, recognition, discard, and confirmation. Verify
known-chords/recommendations change only after confirmation and survive reload.
The ignored `ml/data/smoke/` directory has public A/Dsharpm/Noise validation clips
for repeatable upload tests; they are not independent real-world recordings.

For the independent test, play/label several chords and Noise examples using your
own guitar and microphone; save WAVs under ignored
`ml/data/personal_recordings/<actual-chord>/*.wav`. Record the true chord before
viewing predictions. Keep this initial collection out of all training manifests.

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/evaluate_personal.py ml/data/personal_recordings --output ml/data/personal_initial.json
```

Inspect and preserve initial results before deciding on further data collection
or fine-tuning. Do not repeatedly tune against the consumed official test set.
