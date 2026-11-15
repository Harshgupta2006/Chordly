"""Real exported-model inference and public request boundaries; no training data needed."""

import io
from pathlib import Path
import sys

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from main import app, limiter, slot
from predictor import Predictor


@pytest.fixture
def client():
    limiter.reset()
    with TestClient(app, raise_server_exceptions=False, headers={"origin": "https://testserver"}) as client:
        yield client


def wav(seconds=1, sr=22050):
    buffer = io.BytesIO()
    sf.write(buffer, np.zeros(round(sr * seconds), dtype=np.float32), sr, format="WAV")
    return buffer.getvalue()


def test_health_and_real_inference(client):
    assert client.get("/api/audio/health").json()["classes"] == 25
    response = client.post("/api/audio/predict-chord", files={"audio": ("test.wav", wav(), "audio/wav")})
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "silence" and result["chord"] is None
    assert len(result["class_scores"]) == 25
    assert sum(result["class_scores"].values()) == pytest.approx(1, abs=1e-5)
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("payload,mime,status", [
    (b"", "audio/wav", 422), (b"broken wav", "audio/wav", 422),
    (b"not audio", "text/plain", 415), (wav(.1), "audio/wav", 422),
    (wav(5.1), "audio/wav", 422), (b"x" * (2 * 1024 * 1024 + 1), "audio/wav", 413),
], ids=["empty", "broken", "wrong-type", "too-short", "too-long", "too-large"])
def test_invalid_uploads(client, payload, mime, status):
    response = client.post("/api/audio/predict-chord", files={"audio": ("recording.wav", payload, mime)})
    assert response.status_code == status
    assert "Traceback" not in response.text and "C:\\" not in response.text


def test_cross_origin_and_missing_origin_rejected(client):
    for origin in ["https://unrelated.example", ""]:
        response = client.post("/api/audio/predict-chord", headers={"origin": origin}, content=b"x")
        assert response.status_code == 403


def test_limits_actual_body_without_content_length(client):
    response = client.post("/api/audio/predict-chord", content=iter([b"x" * 1100000] * 2))
    assert response.status_code == 413


def test_rate_limit_and_busy_model(client):
    assert slot.acquire(blocking=False)
    try:
        response = client.post("/api/audio/predict-chord", files={"audio": ("x.wav", wav(), "audio/wav")})
        assert response.status_code == 429
    finally:
        slot.release()
    for _ in range(10):
        response = client.post("/api/audio/predict-chord", files={"audio": ("x.wav", b"bad", "audio/wav")})
    assert response.status_code == 429


def test_sanitized_model_failure(client, monkeypatch):
    import main
    def fail():
        raise ValueError("private database credential and internal path")
    monkeypatch.setattr(main, "get_predictor", fail)
    response = client.get("/api/audio/health")
    assert response.status_code == 503 and "private" not in response.text


def test_model_tampering_fails(monkeypatch):
    import predictor
    monkeypatch.setattr(predictor.hashlib, "sha256", lambda _: type("Hash", (), {"hexdigest": lambda _: "bad"})())
    with pytest.raises(ValueError, match="integrity"):
        Predictor()


def test_runtime_dependencies_match():
    import tomllib
    config = tomllib.loads((ROOT / "pyproject.toml").read_text())
    assert set(config["project"]["dependencies"]) == set((ROOT / "requirements.txt").read_text().splitlines())
