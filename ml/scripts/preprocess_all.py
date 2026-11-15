"""Run only after verified EDA; official test audio is never used here."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.preprocessing.prepare import prepare_all

if __name__ == "__main__":
    prepare_all()
