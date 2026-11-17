# Local recording and recognition verification

## Run the local services

Use the existing Python environment and trained checkpoint. From the repository
root, start FastAPI with the exact frontend origin you intend to open.

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/serve_api.py --port 8105 --frontend-origin http://127.0.0.1:3105
```

In another terminal, start the frontend.

```powershell
cd frontend
$env:NEXT_PUBLIC_ENABLE_AUDIO_ML="true"
$env:NEXT_PUBLIC_ML_API_URL="http://127.0.0.1:8105"
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3105
```

Open `http://127.0.0.1:3105/app`. The local launcher defaults to allowing frontend
ports 3000 and 3100 on localhost and 127.0.0.1. Repeat `--frontend-origin` to add
another explicit loopback origin. A browser using `localhost` has a different
origin from one using `127.0.0.1`.

The browser creates and resumes an AudioContext during the recording tap, then
requests microphone permission. Startup has a 20-second deadline and a Cancel
control. A late permission response releases its microphone tracks. Hiding the
page, losing microphone access or interrupting the audio context stops capture.

The AudioWorklet averages channels into mono samples and emits silent output to
avoid feedback. Recording stops after three seconds. Review playback and Save WAV
before submitting. The browser sends a multipart WAV to
`http://127.0.0.1:8105/audio/predict-chord`. FastAPI validates the upload, loads the
local PyTorch checkpoint and applies its frozen preprocessing and rejection rules.
An accepted result becomes a known chord only after confirmation.

The exported runtime has the separate `/api/audio/predict-chord` route. Its local
regression tests exercise ONNX inference independently. The local workspace above
uses the PyTorch route.

## Checks and remaining microphone verification

Verified on 17 November 2026 with the existing environment.

- Python 3.12.10 and CUDA are available. Local startup loads the existing catalogue.
- The previous frontend origin on port 3105 received a CORS rejection. The explicit
  launcher option permits it and continues rejecting unrelated origins.
- A browser upload of the existing A-chord smoke WAV reaches FastAPI, returns A
  major and exposes the confirmation action.
- Deterministic low-level synthetic hiss with RMS approximately 0.0005 was accepted
  as a chord before the activity check. It now returns `silence` and `chord=null`.
- Rejected results display “No confirmed chord”. The raw model class scores remain
  available separately from the accepted result.
- All 127 validation recordings exceed the existing activity floor. Local and
  exported runtimes agree on the sampled validation classes and generated inputs.
- Mobile anatomy labels select their matching markers and bring the canvas into
  view. Phone backgrounds stay hidden and the tested viewport has no horizontal
  overflow.

The automated browser's microphone request remained pending. Cancellation is
verified, while actual device permission, audible playback and guitar capture
still require a person with a microphone. In a normal browser on this computer,
allow microphone access, record a strum, listen to playback, submit and confirm.
Repeat with fan-only sound, a quiet room, early Stop, permission denial, a page
switch and a disconnected microphone. Confirm the microphone indicator clears
after every stop or cancellation.

Phone-sized browser tests do not establish physical-phone compatibility. On a
phone, 127.0.0.1 points to the phone itself. Physical-device verification requires
a separately configured trusted HTTPS development connection to this computer
and the appropriate development origins. Plain HTTP over a LAN address cannot
provide the required secure microphone context.

The installed Next.js 16.4.2 reports one moderate security advisory in `npm audit`.
The production build completes after the initial advisory interruption. Review
the [Next.js advisory](https://github.com/advisories/GHSA-mfr8-8qww-v76h) when
updating the dependency.

## Improve fan-noise rejection with real recordings

The current model learned from only two independent Noise training recordings.
The official test contains three Noise recordings. Those counts provide little
evidence about fans, speech or handling sounds on a new microphone. Raising the
softmax threshold alone can still accept confident errors.

The activity check uses the already frozen preprocessing floor of 0.003 frame
RMS. It handles low-level input. Fan noise above that floor still requires better
training examples and independent evaluation.

For the next training experiment, collect separate sessions of fan-only sound at
different speeds and microphone distances, room hiss, speech, taps and muted
strings. Collect labelled guitar chords on the same devices, including quieter
strums. Keep recordings private under ignored `ml/data/`.

Split by recording session, device and source before creating windows or
augmentations. Reserve an untouched personal test set. Fine-tune a copy of the CNN
with a balanced mixture of chord examples and real Noise, retaining original
chords to reduce forgetting. Mix measured background noise into training chords
at several signal-to-noise ratios. Select checkpoints and rejection thresholds
using validation data. Preserve the current checkpoint and initial test results.

Evaluate both fan-only false acceptance and chord acceptance. Rejecting every
recording would reduce noise errors while also making the recognizer unusable.
The personal evaluator now reports both measures plus accuracy among all accepted
predictions, including noise incorrectly accepted as a chord in its denominator,
alongside the existing multiclass metrics.

Arrange holdout WAV files as `personal-holdout/Noise/*.wav`,
`personal-holdout/A/*.wav`, and other supported class folders, then run

```powershell
.\ml\.venv\Scripts\python.exe ml/scripts/evaluate_personal.py ml/data/personal-holdout --output ml/data/personal-evaluation-initial.json
```

Each recording must be 0.25–5 seconds. Use a new output filename for later runs to
preserve the first measurement. Actual fan-noise accuracy remains unmeasured until
these independent recordings are available. No training was performed for this
local repair.
