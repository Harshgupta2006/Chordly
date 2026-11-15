"""Train the custom CNN after verified EDA and a functional SVM baseline."""

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.training.cnn import train

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--epochs", type=int, default=80)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--learning-rate", type=float, default=0.001)
    p.add_argument("--patience", type=int, default=15)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--amp", action="store_true")
    p.add_argument("--resume", action="store_true")
    p.add_argument("--output", type=Path)
    a = p.parse_args()
    if min(a.epochs, a.batch_size, a.patience) <= 0 or a.learning_rate <= 0:
        p.error("Training parameters must be positive")
    train(**vars(a))
