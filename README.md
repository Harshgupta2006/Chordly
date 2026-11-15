# Chordly

Find guitar songs you can play with the chords you know, discover near matches,
and choose which chord to learn next. Record a single strum or upload a WAV to
recognize a chord, review the result, and confirm it before adding it to your list.

## Features and architecture

- 187 songs, 47 chord shapes, diagrams and song sheets.
- Playable/near-match ranking, genre/difficulty/search filters and favourites.
- Known chords and filters persist in your browser's localStorage.
- Audio predictions distinguish major and minor: C major, C minor, and so on.
- Responsive recording controls, touch targets, filters and chord inspector.

```text
Browser -> Next.js / React / TypeScript
            |-- bundled catalogue + TypeScript set matching
            `-- POST /api/audio/predict-chord (same-origin HTTPS)
                  -> dedicated FastAPI service -> ONNX Runtime (CPU)

backend/   optional catalogue API -> Python matching -> SQLModel database
ml/        dataset exploration, EDA, preprocessing, SVM/CNN training and evaluation
```

The default song browser uses bundled JSON and needs no external API or database.
The optional `NEXT_PUBLIC_API_URL` selects a separately hosted catalogue API.
Matching compares required and known chord sets, ranks missing chords and song
difficulty, and counts which new chord unlocks the most songs. It is deterministic;
collaborative filtering, user accounts and learning from practice history have
not been implemented.

The dedicated hosted audio service lives in `frontend/audio_backend/`. It has no
database connection. `frontend/vercel.json` defines web and Python services within
the existing Vercel project root (`frontend`), routing `/api/audio/*` to FastAPI.
[Vercel Services](https://vercel.com/docs/services) is currently in beta.

## Audio model and measured limitations

The custom CNN was trained from scratch on the pinned
[rodriler/isolated-guitar-chords dataset](https://huggingface.co/datasets/rodriler/isolated-guitar-chords).
There are 780 recordings and 25 labels: 24 major/minor chords and Noise. The official
split contains 633 training and 147 test recordings. Training was divided into
506 train / 127 validation recordings before producing derived features.

| Model | Validation accuracy | Official test accuracy | Test macro F1 |
| --- | ---: | ---: | ---: |
| SVM, 88 aggregate features | 96.06% | 90.48% | 0.8998 |
| CNN, 157,945 parameters | 99.21% | 87.76% | 0.8591 |

The SVM performs better on the official test set. The audio interface uses the
CNN prototype. It missed every D recording in the official test set and rejected
only two of three Noise recordings. Model scores are **uncalibrated**: confident
mistakes on another guitar or microphone are possible. Personal-guitar evaluation
remains pending. D-sharp minor can be detected but cannot be added because the
catalogue lacks its fingering. The model does not recognize complete songs,
progressions, seventh chords or capo positions from audio.

Hosting exports the existing checkpoint to ONNX without retraining. Frozen
normalization, label order, rejection threshold, Hann window and Mel filters are
bundled with the model. NumPy/SciPy reproduce the spectral transform; ONNX Runtime
runs inference on CPU. Parity tests compare features, scores, labels and rejection
decisions with PyTorch across every validation class. This avoids shipping CUDA,
PyTorch, notebooks or the dataset to Vercel. No recognition API key is required.

See [ML setup](ml/README.md), [learning guide](ml/LEARNING_GUIDE.md),
[EDA findings](ml/reports/milestone_1.md) and
[model evaluation](ml/reports/model_evaluation.md).

## Run locally

Frontend, with Node.js 22 or 24:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000/app`. For local audio using the existing ML environment,
start another terminal at the repository root:

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/serve_api.py
```

Then start the frontend with:

```powershell
cd frontend
$env:NEXT_PUBLIC_ENABLE_AUDIO_ML="true"
$env:NEXT_PUBLIC_ML_API_URL="http://127.0.0.1:8100"
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100/app`. Microphone access requires localhost or HTTPS.
Use one 0.25-5 second WAV under 2 MiB. Recording stops after three seconds.
Playback and Save WAV let you review it; recognition runs only after submission.

The hosted application can also run locally with its runtime dependencies:

```powershell
.\ml\.venv\Scripts\python.exe -m uvicorn main:app --app-dir frontend/audio_backend --host 127.0.0.1 --port 8102
```

Routes: `GET /api/audio/health` and `POST /api/audio/predict-chord`, multipart field
`audio`. Next.js development mode alone does not start this Python service.

Optional catalogue API:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Without database variables it uses local SQLite. Docker PostgreSQL is optional;
its published port is restricted to loopback. Checked-in Docker/SQL development
passwords are public examples, **never production credentials**. Production API
hosting requires `ENVIRONMENT=production`, a read-only `DATABASE_URL_READONLY`
with TLS, and explicit `ALLOWED_ORIGINS`. Admin credentials belong only in migration
and seeding environments.

## Deployment and secrets

The existing GitHub integration deploys `main` to the Chordly Vercel project.
Keep its root directory as `frontend`; the Services configuration builds Next.js
and FastAPI together. Python is pinned to 3.12. Inference files are server assets
outside `public/`. Cold Python instances can take longer on the first request.

- Keep private local values in ignored `.env` / `.env.local` files and hosted
  credentials in Vercel **Secret** environment variables. Commit only placeholder
  `.env.example` files. Use separate production and preview credentials.
- `NEXT_PUBLIC_*` values appear in browser JavaScript. The build rejects
  secret-named public variables and catalogue URLs containing credentials or query
  strings. Production audio uses a fixed same-origin URL, without an API key.
- `.gitignore` excludes environment files, Vercel state, private keys, common
  credential files, private notes, datasets, training checkpoints and scratch
  outputs. It contains filenames/patterns, never secret values. The small ONNX
  inference export is intentionally included in server source.
- A redacted credential-pattern scan checks source and reachable Git history in
  CI. It cannot recognize every possible secret format. If a real credential was
  ever committed, revoke/rotate it at its provider; `.gitignore` cannot erase old
  Git history or existing deployments.

Read [security controls and remaining limits](SECURITY.md).

## Verification

From the repository root using the existing ML environment:

```powershell
.\ml\.venv\Scripts\python.exe scripts/check_secrets.py --history
.\ml\.venv\Scripts\python.exe -m unittest discover -s scripts/tests -v
.\ml\.venv\Scripts\python.exe -m pytest backend/tests -q
.\ml\.venv\Scripts\python.exe -m pytest frontend/audio_backend/tests -q
.\ml\.venv\Scripts\python.exe -m pytest ml/tests -q
cd frontend
node --test tests/*.test.mjs
npm audit --audit-level=high
npm run build
```

GitHub Actions runs catalogue tests, hosted audio/security tests, the secret scan,
production build and dependency audits. Full ML parity tests also need the ignored
local dataset and checkpoint. CI uses the small exported model and generated
audio. For a deliberate new export, install `ml/requirements-export.txt` inside
`ml/.venv`, run `ml/scripts/export_hosted_model.py`, and verify parity before release.

## Credits

- Song catalogue: *Lyrics and Chords from Ultimate-Guitar*, taylorflandro on Kaggle;
  cleaned with `backend/scripts/import_kaggle.py`.
- Audio dataset: *Isolated Guitar Chords* by rodriler, sourced from severyn-k,
  licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  [Dataset source](https://huggingface.co/datasets/rodriler/isolated-guitar-chords).
  Recognition weights were independently trained; no pretrained model is used.
