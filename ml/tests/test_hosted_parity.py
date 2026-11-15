"""Verify the deployment export against original features/weights without tuning."""

import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
import pytest

pytest.importorskip("onnxruntime")

from src.inference.predictor import Predictor
from src.preprocessing.audio import load_audio

ROOT = Path(__file__).resolve().parents[2]
HOSTED = ROOT / "frontend/audio_backend"
sys.path.insert(0, str(HOSTED))
spec = importlib.util.spec_from_file_location("hosted_predictor", HOSTED / "predictor.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_waveform_transform_copy_is_identical():
    assert (HOSTED / "preprocessing.py").read_bytes() == (ROOT / "ml/src/preprocessing/audio.py").read_bytes()


def test_original_and_export_agree_on_validation_and_generated_audio():
    original, hosted = Predictor(device="cpu"), module.Predictor()
    report = json.loads((ROOT / "ml/data/dataset_inspection_report.json").read_text())
    # One existing validation recording per class; no test-set selection/tuning.
    split = np.load(ROOT / "ml/data/processed/validation_3s.npz")
    paths = set(map(str, split["paths"]))
    selected = {}
    for row in report["records"]:
        if row["path"] in paths:
            selected.setdefault(row["label"], row)
    audio = [load_audio(row["local_path"]) for row in selected.values()]
    audio.extend([(np.zeros(44100, dtype=np.float32), 22050),
                  (np.random.default_rng(42).normal(0, .01, (48000, 2)).astype(np.float32), 48000)])
    assert len(selected) == 25
    for samples, sr in audio:
        np.testing.assert_allclose(hosted.features(samples, sr), original.features(samples, sr), atol=3e-5, rtol=1e-5)
        np.testing.assert_allclose(hosted.scores(samples, sr), original.scores(samples, sr), atol=2e-5, rtol=1e-4)
        actual, expected = hosted.predict(samples, sr), original.predict(samples, sr)
        assert (actual["predicted_class"], actual["status"]) == (expected["predicted_class"], expected["status"])
