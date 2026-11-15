"""Resume only an isolated copy; the final evaluated model is never modified."""

from pathlib import Path
import shutil
import pytest
import torch
from src.dataset import ML_ROOT, file_sha256
from src.training.cnn import train


@pytest.mark.skipif(
    not (ML_ROOT / "artifacts/cnn/last.pt").exists(),
    reason="Requires local training checkpoint and prepared data",
)
def test_resume_advances_an_isolated_checkpoint(tmp_path):
    original = ML_ROOT / "artifacts/cnn"
    before = file_sha256(original / "best.pt")
    for name in ["last.pt", "best.pt"]:
        shutil.copy2(original / name, tmp_path / name)
    state = torch.load(tmp_path / "last.pt", weights_only=False, map_location="cpu")
    next_epoch = state["epoch"] + 2
    train(epochs=next_epoch, resume=True, output=tmp_path)
    resumed = torch.load(tmp_path / "last.pt", weights_only=False, map_location="cpu")
    assert resumed["epoch"] == state["epoch"] + 1
    assert len(resumed["history"]) == len(state["history"]) + 1
    assert file_sha256(original / "best.pt") == before
