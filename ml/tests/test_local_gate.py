"""The ML opt-in must never register a production route or require ML by default."""

import os
from pathlib import Path
import subprocess
import sys
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("sqlmodel")
pytest.importorskip("slowapi")


@pytest.mark.parametrize(
    "environment,enabled,expected",
    [
        ("development", "false", False),
        ("development", "true", True),
        ("production", "true", False),
    ],
)
def test_route_registration_is_local_only(environment, enabled, expected):
    root = Path(__file__).resolve().parents[2]
    env = {
        **os.environ,
        "ENVIRONMENT": environment,
        "ENABLE_AUDIO_ML": enabled,
        "DATABASE_URL_READONLY": "postgresql://reader:placeholder@localhost:5432/chordly?sslmode=require",
    }
    code = "from app.main import app; print(any(getattr(r,'path','')=='/audio/predict-chord' for r in app.routes))"
    result = subprocess.run(
        [sys.executable, "-B", "-c", code],
        cwd=root / "backend",
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )
    assert result.stdout.strip() == str(expected)
