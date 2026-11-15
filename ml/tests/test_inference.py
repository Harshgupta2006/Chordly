import json
import numpy as np
import pytest
from src.dataset import ML_ROOT
from src.inference.predictor import Predictor
from src.preprocessing.audio import load_audio, InvalidAudio

pytestmark = pytest.mark.skipif(
    not (ML_ROOT / "artifacts/cnn/rejection.json").exists(),
    reason="Requires locally trained CNN artifact",
)


@pytest.fixture(scope="module")
def predictor():
    import torch

    torch.set_num_threads(2)
    return Predictor(device="cpu")


def test_inference_features_equal_training_transform(predictor):
    duration = predictor.audio.duration
    stored = np.load(ML_ROOT / f"data/processed/validation_{duration:g}s.npz")
    report = json.loads((ML_ROOT / "data/dataset_inspection_report.json").read_text())
    row = next(r for r in report["records"] if r["path"] == str(stored["paths"][0]))
    y, sr = load_audio(row["local_path"])
    actual = predictor.features(y, sr)
    expected = (stored["mel"][0] - predictor.mean) / predictor.std
    assert np.allclose(actual, expected, rtol=0, atol=1e-5)


def test_scores_and_silent_recording(predictor):
    result = predictor.predict(np.zeros(44100, dtype=np.float32), 22050)
    assert result["status"] == "silence" and result["chord"] is None
    assert len(result["class_scores"]) == 25
    assert sum(result["class_scores"].values()) == pytest.approx(1.0, abs=1e-5)


def test_unsupported_chord_is_not_added(predictor, monkeypatch):
    scores = np.zeros(25)
    scores[predictor.names.index("D#m")] = 1
    monkeypatch.setattr(predictor, "scores", lambda y, sr: scores)
    result = predictor.predict(np.ones(44100, dtype=np.float32) * 0.1, 22050)
    assert result["status"] == "unsupported" and result["chord"] is None


def test_short_upload_is_rejected(predictor, tmp_path):
    import soundfile as sf

    p = tmp_path / "tiny.wav"
    sf.write(p, np.zeros(200), 22050)
    with pytest.raises(InvalidAudio):
        predictor.predict_file(p)
