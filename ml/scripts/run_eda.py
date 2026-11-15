"""Generate reproducible exploratory plots from a verified inspection report. Uses pinned WAV paths and SoundFile; never datasets.Audio."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.exploration import run_eda

if __name__ == "__main__":
    result = run_eda()
    if not result.get("inventory_verified", False):
        raise SystemExit(1)
