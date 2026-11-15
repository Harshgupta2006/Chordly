"""Exercise the real local model through HTTP without starting catalog startup/seeding."""

import io
from pathlib import Path
import sys
import numpy as np
import pytest
import soundfile as sf

pytest.importorskip("fastapi")
pytest.importorskip("slowapi")
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.util import get_remote_address

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app.audio import build_audio_router, MAX_BYTES
from src.dataset import ML_ROOT

pytestmark = pytest.mark.skipif(
    not (ML_ROOT / "artifacts/cnn/rejection.json").exists(),
    reason="Requires trained local artifact",
)


@pytest.fixture
def client():
    limiter = Limiter(key_func=get_remote_address, enabled=False)
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(build_audio_router(limiter))
    return TestClient(app)


def wav(seconds=1.0, sr=22050):
    stream = io.BytesIO()
    sf.write(stream, np.zeros(int(seconds * sr)), sr, format="WAV", subtype="PCM_16")
    return stream.getvalue()


def test_real_silence_and_probability_contract(client):
    response = client.post(
        "/audio/predict-chord", files={"audio": ("recording.wav", wav(), "audio/wav")}
    )
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "silence" and result["chord"] is None
    assert len(result["class_scores"]) == 25
    assert sum(result["class_scores"].values()) == pytest.approx(1.0, abs=1e-5)


@pytest.mark.parametrize(
    "content, mime, expected",
    [
        (b"not WAV", "audio/wav", 422),
        (b"", "audio/wav", 422),
        (b"text", "text/plain", 415),
        (b"x" * (MAX_BYTES + 1), "audio/wav", 413),
        (wav(0.1), "audio/wav", 422),
        (wav(6), "audio/wav", 422),
    ],
    ids=["malformed", "empty", "wrong_type", "too_large", "too_short", "too_long"],
)
def test_upload_boundaries(client, content, mime, expected):
    response = client.post(
        "/audio/predict-chord", files={"audio": ("recording.wav", content, mime)}
    )
    assert response.status_code == expected
    assert "Traceback" not in response.text and "C:\\" not in response.text


def test_missing_upload(client):
    assert client.post("/audio/predict-chord").status_code == 422


def test_busy_inference_returns_429(client):
    import app.audio

    app.audio._inference_slot.acquire()
    try:
        response = client.post(
            "/audio/predict-chord", files={"audio": ("a.wav", wav(), "audio/wav")}
        )
        assert response.status_code == 429
    finally:
        app.audio._inference_slot.release()


def test_rate_limit_is_enforced(monkeypatch):
    import app.audio as audio_module
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded

    limiter = Limiter(key_func=get_remote_address)
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(build_audio_router(limiter))
    monkeypatch.setattr(audio_module, "_predict", lambda content: {"status": "silence"})
    with TestClient(app) as client:
        statuses = [
            client.post(
                "/audio/predict-chord", files={"audio": ("a.wav", wav(), "audio/wav")}
            ).status_code
            for _ in range(11)
        ]
    assert statuses[:10] == [200] * 10 and statuses[-1] == 429


def test_missing_model_returns_sanitized_503(client, monkeypatch):
    import app.audio

    def unavailable():
        raise FileNotFoundError("private model path")

    monkeypatch.setattr(app.audio, "get_predictor", unavailable)
    response = client.post(
        "/audio/predict-chord", files={"audio": ("a.wav", wav(), "audio/wav")}
    )
    assert response.status_code == 503 and "private model path" not in response.text
