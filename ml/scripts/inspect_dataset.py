"""Verify every source recording and save the dataset inspection JSON. Uses pinned WAV paths and SoundFile; never datasets.Audio."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.exploration import inspect_dataset

if __name__ == "__main__":
    result = inspect_dataset()
    if not result.get("inventory_verified", False):
        raise SystemExit(1)
