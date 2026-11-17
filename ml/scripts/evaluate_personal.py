"""Evaluate a separate labelled personal-guitar directory; never train on it.

Layout: recordings/<true-chord>/*.wav; include a Noise folder. Output records
each prediction and its true label. These results never enter training arrays.
"""

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.dataset import write_json, file_sha256
from src.inference.predictor import Predictor
from src.evaluation.metrics import classification_metrics, recognition_metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recordings", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise RuntimeError(
            "Personal evaluation output already exists; choose a new filename to preserve initial results"
        )
    predictor = Predictor()
    rows = []
    truth = []
    pred = []
    files = sorted(args.recordings.glob("*/*.wav"))
    if not files:
        raise ValueError("No labelled WAV recordings found")
    for path in files:
        actual = path.parent.name
        if actual not in predictor.names:
            raise ValueError(f"Unknown true label: {actual}")
        result = predictor.predict_file(path)
        rows.append(
            {"file": str(path), "sha256": file_sha256(path), "actual": actual, **result}
        )
        truth.append(predictor.names.index(actual))
        pred.append(predictor.names.index(result["predicted_class"]))
    write_json(
        args.output,
        {
            "dataset_role": "personal holdout; NOT used in training",
            "model_sha256": file_sha256(predictor.root / "best.pt"),
            "recordings": rows,
            "metrics": classification_metrics(truth, pred, predictor.names),
            "recognition_metrics": recognition_metrics(rows),
            "note": "Macro metrics include all 25 model labels; consult per-class support when some chords are absent.",
        },
    )
    print(f"Saved independent personal-recording evaluation to {args.output}")


if __name__ == "__main__":
    main()
