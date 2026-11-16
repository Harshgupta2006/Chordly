# Chordly

Find guitar songs you can play with the chords you know, discover near matches,
and choose which chord to learn next. Record a single strum or upload a WAV to
recognize a chord, review the result, and confirm it before adding it to your list.

## Features and architecture

- Guitar chord shapes, interactive diagrams and song sheets.
- Playable/near-match ranking, genre/difficulty/search filters and favourites.
- Known chords and filters persist in your browser's localStorage.
- Audio predictions display explicit major and minor chord names.
- Responsive recording controls, touch targets, filters and chord inspector.
- A personalized For You feed, genre preferences and device-local practice history.
- A scroll-driven guitar anatomy tour with numbered, interactive part labels.
- Favorites shortcuts, return-position restoration and reversible practice tracking.

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
difficulty, and recommends which new chord unlocks the most songs.

The dedicated hosted audio service lives in `frontend/audio_backend/`. It has no
database connection. `frontend/vercel.json` defines web and Python services within
the existing Vercel project root (`frontend`), routing `/api/audio/*` to FastAPI.
The deployment uses [Vercel Services](https://vercel.com/docs/services).

## Frontend architecture and logic

The frontend uses Next.js App Router, React, TypeScript and Tailwind CSS. The root
route opens the discovery workspace at `/app`. Song cards link to practice sheets
at `/app/song/[id]`.

### Workspace state and data flow

The workspace coordinates selected chords, the chord preview, search and filter
settings, favourites, matching results and next-chord recommendations through React
state. Saved preferences load after the component mounts. Subsequent changes save
the updated practice list and filters back to localStorage.

Changing known chords or filters starts a 300 ms debounce. The workspace then
requests matching songs and next-chord suggestions together with `Promise.all`.
Loading states provide feedback while results update, and a retry control handles
request errors. The favourites view matches saved song IDs against the selected
chords and filters, including saved songs with additional chords to learn.

The typed API client provides a shared interface for catalogue access. By default,
it calls the bundled TypeScript matching engine and reads chord, song and sheet
JSON from `frontend/data/`. A configured remote catalogue URL directs those calls
to the FastAPI service.

### Chord compatibility and ranking

The matching engine converts the selected chords into a JavaScript `Set`. For
each song, it finds the required chords absent from that set.

```text
missing chords = required song chords - known chords
```

- A song is playable when every required chord is already known.
- A song becomes a near match when one or two required chords are missing,
  subject to the selected missing-chord filter.
- Genre, difficulty and title/artist search narrow the candidate songs.

Playable results sort by difficulty, chord count and title. Near matches sort by
missing-chord count first, then difficulty, chord count and title. These tie-breaks
keep the result order consistent as the workspace updates.

### Learn Next recommendations

For each song with exactly one missing chord, the engine records which chord
would make the song playable. It ranks candidate chords by the number of songs
they unlock. Ties favour non-barre shapes, followed by chord-name order. Adding a
suggestion updates the known-chords list and refreshes the matches.

### Browser persistence

| Storage key | Saved information |
| --- | --- |
| `chordly_practice_list_v1` | Known chords and favourite song IDs |
| `chordly_filters_v1` | Search, genre, difficulty, missing-chord preference and sort choice |
| `chordly_personalization_v1` | Genre and practice preferences, practice history and hidden recommendations |

Storage helpers parse JSON inside error handlers, validate saved chord names
against the canonical chord set, and restore defaults when saved data is invalid.
Preferences are available again when the user reloads or returns from a song sheet.

### Personalized music discovery

The For You feed combines chord compatibility with content similarity and individual
preferences. A Python pipeline uses Pandas, NumPy and Scikit-learn to encode chord
sets, genres, artists and difficulty. TF-IDF weights chord features, and normalized
song vectors support cosine-similarity ranking in the browser.

Favourites and explicitly recorded practice build a preference vector. Recent
practice receives more weight, while songs practised in the last few days receive
a discovery penalty. Genre choices, practice level and a focus on familiar or new
chords shape the results. Each suggestion explains its connection to the user's
chords or interests. A personalized next-chord suggestion highlights a shape that
opens relevant songs.

Users can mark practice from recommendations, catalogue cards and song sheets.
The history records each song once per local day. Profile preferences and history
stay in localStorage on the device. Reset controls are available under
Your preferences, and the existing saved chords and favourites carry forward.

The offline evaluation command reads local practice-history fixtures and compares the same
browser ranking engine with the chord-matching baseline. It measures Precision@5,
Recall@5 and NDCG@5 using chronological practice-history splits. Personal history files belong in ignored `ml/data/`.

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/build_recommendation_features.py
.\ml\.venv\Scripts\python.exe ml/scripts/evaluate_recommendations.py path/to/practice-history.json
```

### Audio recognition flow

1. The user starts microphone recording or chooses a WAV file.
2. An AudioWorklet collects microphone samples and averages input channels to mono.
   The browser encodes the captured samples as a PCM WAV and stops recording
   automatically after three seconds.
3. Playback and Save WAV controls let the user review the recording.
4. Submitting sends the WAV as multipart form data to the same-origin
   `/api/audio/predict-chord` endpoint.
5. The interface displays the predicted chord with its major/minor name and model
   scores. Confirming an accepted result adds it to the known-chords list and
   refreshes song matches. Discarding returns to the recording flow.

The component manages permission feedback, request cancellation and timeouts.
It releases microphone tracks, closes the AudioContext and revokes playback URLs
when the recording is replaced or the component unmounts.

### Responsive interface

Chord buttons provide selection feedback and fingering previews. The fretboard
renders string positions from the canonical chord catalogue. Desktop layouts show
the inspector alongside the chord grid. Mobile layouts use a scrollable bottom
sheet with a close control, Escape dismissal, keyboard focus handling and safe-area
spacing.

Recording actions stack on narrow screens, playback uses the available width,
and touch controls have larger targets. Search and filter controls adapt across
screen sizes, headings wrap, and reduced-motion preferences adjust animations.
Phone navigation keeps Favorites visible and provides comfortably sized tap
targets. Song-sheet actions stack vertically, chord diagrams scale within their
cards, and diagrams support keyboard selection. The mobile inspector scrolls
within the screen and accounts for the phone's safe area.
Progression presets display complete descriptions on phones and touch devices;
desktop descriptions appear on hover or keyboard focus. Each preset's active
state follows its exact chord order.
Song cards combine difficulty, chord requirements, favourites, practice-sheet
navigation and guitar-lesson search links.

The opening guitar anatomy tour uses one continuous photograph and GSAP
ScrollTrigger to guide close-ups of the tuning area, playing surface, body and
bridge. Numbered labels match markers on the guitar. Hovering, focusing or tapping
a label highlights its pointer. Phones provide a tap-to-explore anatomy viewer
with an area selector, previous/next controls and linked numbered markers.
Reduced-motion and JavaScript-free views retain readable explanations. Desktop
body and fretboard photographs provide ambient background movement. Mobile
workspaces, recommendations and song sheets use a plain dark background.

Audio recognition and manual chord selection share a setup area after the tour.
Matching songs follow, with separate Show more controls for playable songs and
near matches. Personalized songs and recent practice come next, followed by a
combined learning section that prioritizes personalized chord advice.
Learning suggestions share the same card layout, chord typography and shape-preview
and add-chord controls. Shape previews bring the desktop inspector into view or
open its mobile drawer.
Footer arrows return to the top and focus the opening heading on the workspace
and the song title on both song-page routes.

The Chordly logo returns to the opening view. Favorites jumps to saved songs and
toggles back to ordinary matches on a second click. Opening a song preserves the
workspace filters, expanded results and reading position for the return journey.
Music preferences open by default. The Recently practised panel offers a Remove action,
and clicking a song's Practised today control again removes that day's entry.
The amber pick-and-headstock logo uses the supplied artwork with a transparent
background and links back to the opening view throughout the application.

| Frontend area | Main implementation |
| --- | --- |
| Workspace state and orchestration | `frontend/app/app/page.tsx` |
| Typed catalogue API | `frontend/lib/api.ts` |
| Matching and Learn Next logic | `frontend/lib/matchingEngine.ts` |
| Saved practice list and filters | `frontend/lib/localStorage.ts` |
| Chord selection and diagrams | `frontend/components/ChordSelector.tsx`, `frontend/components/Fretboard.tsx` |
| Search and song results | `frontend/components/FilterBar.tsx`, `frontend/components/ResultsPanel.tsx`, `frontend/components/SongCard.tsx` |
| Recording and recognition | `frontend/components/ChordRecognition.tsx`, `frontend/lib/audio.ts`, `frontend/public/audio-capture-worklet.js` |

## Audio model and evaluation

The custom CNN was trained from scratch on the pinned
[rodriler/isolated-guitar-chords dataset](https://huggingface.co/datasets/rodriler/isolated-guitar-chords).
There are 780 recordings and 25 labels: 24 major/minor chords and Noise. The official
split contains 633 training and 147 test recordings. Training was divided into
506 train / 127 validation recordings before producing derived features.

| Model | Validation accuracy | Official test accuracy | Test macro F1 |
| --- | ---: | ---: | ---: |
| SVM, 88 aggregate features | 96.06% | 90.48% | 0.8998 |
| CNN, 157,945 parameters | 99.21% | 87.76% | 0.8591 |

The audio interface uses the custom CNN to predict isolated guitar chords from
Log-Mel spectrograms and display the result for user confirmation.

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
outside `public/`.

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
  CI. Credential management and incident-response procedures are documented in
  the security guide.

Read [security controls](SECURITY.md).

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
