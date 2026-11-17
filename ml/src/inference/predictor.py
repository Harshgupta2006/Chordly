"""Inference shares the exact waveform and spectral transforms used in training."""

import json
import os
from pathlib import Path
import time
import numpy as np
import torch

from src.dataset import ML_ROOT
from src.features.spectral import MelConfig, log_mel
from src.models.cnn import ChordCNN
from src.preprocessing.audio import (
    AudioConfig, InvalidAudio, activity_profile, load_audio, prepare_audio, resample,
    validate_samples,
)


class Predictor:
    def __init__(self, artifact_dir=None, device=None):
        torch.set_num_threads(int(os.getenv("TORCH_NUM_THREADS", "2")))
        self.root = Path(artifact_dir) if artifact_dir else ML_ROOT / "artifacts/cnn"
        self.config = json.loads((self.root / "config.json").read_text())
        self.names = self.config["class_names"]
        if len(set(self.names)) != len(self.names) or "Noise" not in self.names:
            raise ValueError("Invalid artifact label mapping")
        self.audio = AudioConfig(**self.config["audio"])
        self.mel = MelConfig(**self.config["mel"])
        self.mean = np.asarray(self.config["normalization"]["mean"], dtype=np.float32)[
            :, None
        ]
        self.std = np.asarray(self.config["normalization"]["std"], dtype=np.float32)[
            :, None
        ]
        if (
            self.mean.shape != (self.mel.n_mels, 1)
            or self.std.shape != self.mean.shape
            or not np.isfinite(self.mean).all()
            or not np.isfinite(self.std).all()
            or (self.std <= 0).any()
        ):
            raise ValueError("Invalid feature normalization metadata")
        self.device = torch.device(
            device or ("cuda" if torch.cuda.is_available() else "cpu")
        )
        self.model = ChordCNN(len(self.names), self.mel.n_mels).to(self.device)
        self.model.load_state_dict(
            torch.load(
                self.root / "best.pt", map_location=self.device, weights_only=True
            )
        )
        self.model.eval()
        self.threshold = json.loads((self.root / "rejection.json").read_text())[
            "threshold"
        ]
        self.supported = {
            c["name"]
            for c in json.loads(
                (ML_ROOT.parent / "frontend/data/chords.json").read_text()
            )
        }

    def features(self, audio, sr):
        waveform = prepare_audio(audio, sr, self.audio)
        mel = log_mel(waveform, self.audio.sample_rate, self.mel)
        return ((mel - self.mean) / self.std).astype(np.float32)

    def scores(self, audio, sr):
        x = torch.from_numpy(self.features(audio, sr))[None, None].to(self.device)
        with torch.inference_mode():
            return self.model(x).softmax(1)[0].cpu().numpy()

    def predict(self, audio, sr):
        start = time.perf_counter()
        audio = validate_samples(audio, sr, self.audio.max_input_seconds)
        scores = self.scores(audio, sr)
        index = int(scores.argmax())
        label = self.names[index]
        confidence = float(scores[index])
        rms = float(np.sqrt(np.mean(np.asarray(audio, dtype=float) ** 2)))
        # Use the frozen preprocessing floor to reject input with no detectable activity.
        _, onset, _ = activity_profile(
            resample(audio, sr, self.audio.sample_rate), self.audio.sample_rate, self.audio
        )
        status = "ok"
        if rms < 0.0001 or onset is None:
            status = "silence"
        elif label == "Noise":
            status = "noise"
        elif confidence < self.threshold:
            status = "uncertain"
        elif label not in self.supported:
            status = "unsupported"
        return {
            "status": status,
            "predicted_class": label,
            "chord": label if status == "ok" else None,
            "model_score": confidence,
            "threshold": self.threshold,
            "class_scores": {n: float(v) for n, v in zip(self.names, scores)},
            "supported": label in self.supported,
            "model_version": self.config["architecture"],
            "score_explanation": "Uncalibrated model score, not a guarantee of correctness on a new guitar or microphone.",
            "processing_ms": round((time.perf_counter() - start) * 1000, 2),
        }

    def predict_file(self, source):
        y, sr = load_audio(source, max_seconds=5.0)
        if len(y) / sr < 0.25:
            raise InvalidAudio("Record at least 0.25 seconds and at most 5 seconds")
        return self.predict(y, sr)
