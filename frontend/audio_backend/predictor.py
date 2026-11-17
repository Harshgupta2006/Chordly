"""CPU-only ONNX inference with the frozen training transforms and label mapping."""

import hashlib
import json
from pathlib import Path
import time

import numpy as np
import onnxruntime as ort
from scipy.fft import rfft

from preprocessing import (
    AudioConfig, InvalidAudio, activity_profile, load_audio, prepare_audio, resample,
    validate_samples,
)


class Predictor:
    def __init__(self):
        root = Path(__file__).resolve().parent / "model"
        self.config = json.loads((root / "config.json").read_text())
        path = root / "chord_cnn.onnx"
        if hashlib.sha256(path.read_bytes()).hexdigest() != self.config["onnx_sha256"]:
            raise ValueError("Model integrity check failed")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(path), sess_options=options,
                                           providers=["CPUExecutionProvider"])
        self.names = self.config["class_names"]
        self.audio = AudioConfig(**self.config["audio"])
        self.mel = self.config["mel"]
        self.mean = np.asarray(self.config["normalization"]["mean"], dtype=np.float32)[:, None]
        self.std = np.asarray(self.config["normalization"]["std"], dtype=np.float32)[:, None]
        with np.load(root / "spectral.npz", allow_pickle=False) as data:
            self.filters = data["mel_filters"]
            self.window = data["window"]

    def features(self, audio, sr):
        y = prepare_audio(audio, sr, self.audio)
        n_fft, hop = self.mel["n_fft"], self.mel["hop_length"]
        # librosa's default STFT: centered, zero-padded, periodic Hann window.
        padded = np.pad(y, (n_fft // 2, n_fft // 2))
        frames = np.lib.stride_tricks.sliding_window_view(padded, n_fft)[::hop]
        spectrum = rfft(frames * self.window, axis=-1).astype(np.complex64)
        power = np.abs(spectrum).T ** 2
        mel = self.filters @ power
        db = 10 * np.log10(np.maximum(np.float32(1e-10), mel))
        db = np.clip(db, self.mel["floor_db"], self.mel["ceiling_db"])
        return ((db - self.mean) / self.std).astype(np.float32)

    def scores(self, audio, sr):
        logits = self.session.run(None, {"spectrogram": self.features(audio, sr)[None, None]})[0][0]
        values = np.exp(logits - logits.max())
        return values / values.sum()

    def predict(self, audio, sr):
        started = time.perf_counter()
        audio = validate_samples(audio, sr, self.audio.max_input_seconds)
        scores = self.scores(audio, sr)
        index = int(scores.argmax())
        label, confidence = self.names[index], float(scores[index])
        threshold = self.config["threshold"]
        supported = label in self.config["supported"]
        rms = float(np.sqrt(np.mean(np.asarray(audio, dtype=float) ** 2)))
        _, onset, _ = activity_profile(
            resample(audio, sr, self.audio.sample_rate), self.audio.sample_rate, self.audio
        )
        status = ("silence" if rms < 0.0001 or onset is None else "noise" if label == "Noise" else
                  "uncertain" if confidence < threshold else "unsupported" if not supported else "ok")
        return {
            "status": status, "predicted_class": label,
            "chord": label if status == "ok" else None,
            "model_score": confidence, "threshold": threshold,
            "class_scores": {name: float(value) for name, value in zip(self.names, scores)},
            "supported": supported, "model_version": self.config["architecture"],
            "score_explanation": "Uncalibrated model score, not a guarantee of correctness on a new guitar or microphone.",
            "processing_ms": round((time.perf_counter() - started) * 1000, 2),
        }

    def predict_file(self, source):
        audio, sr = load_audio(source, max_seconds=5)
        if len(audio) / sr < 0.25:
            raise InvalidAudio("Record at least 0.25 seconds and at most 5 seconds")
        return self.predict(audio, sr)
