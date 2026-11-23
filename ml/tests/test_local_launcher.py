import importlib.util
from pathlib import Path

import pytest
import uvicorn


@pytest.fixture
def launcher(tmp_path, monkeypatch):
    source = Path(__file__).resolve().parents[1] / "scripts/serve_api.py"
    spec = importlib.util.spec_from_file_location("local_launcher", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    checkpoint = tmp_path / "ml/artifacts/cnn"
    checkpoint.mkdir(parents=True)
    for filename in ("best.pt", "config.json", "rejection.json"):
        (checkpoint / filename).touch()
    monkeypatch.setattr(module, "__file__", str(tmp_path / "ml/scripts/serve_api.py"))
    monkeypatch.setattr(uvicorn, "run", lambda *args, **kwargs: None)
    for name in ["ENVIRONMENT", "ENABLE_AUDIO_ML", "DATABASE_URL_READONLY", "ALLOWED_ORIGINS", "CHORDLY_LOCAL_AUDIO_ARTIFACT_DIR"]:
        monkeypatch.setenv(name, "test")
    return module


def test_additional_loopback_frontend_origin(launcher, monkeypatch):
    import os
    monkeypatch.setattr("sys.argv", ["serve_api.py", "--port", "8105", "--frontend-origin", "http://127.0.0.1:3105"])
    launcher.main()
    assert Path(os.environ["CHORDLY_LOCAL_AUDIO_ARTIFACT_DIR"]) == Path(launcher.__file__).resolve().parents[2] / "ml/artifacts/cnn"
    assert "http://127.0.0.1:3105" in os.environ["ALLOWED_ORIGINS"].split(",")
    assert "http://localhost:3000" in os.environ["ALLOWED_ORIGINS"].split(",")


@pytest.mark.parametrize("origin", ["https://other.example", "http://user:secret@localhost:3105", "http://localhost:3105/path", "http://localhost:99999", "http://[invalid"])
def test_rejects_invalid_or_nonlocal_frontend_origins(launcher, monkeypatch, origin):
    monkeypatch.setattr("sys.argv", ["serve_api.py", "--frontend-origin", origin])
    with pytest.raises(SystemExit) as error:
        launcher.main()
    assert error.value.code == 2
