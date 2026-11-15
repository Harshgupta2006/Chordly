"""Post-evaluation diagnostics only. Never changes models, labels or thresholds."""

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import librosa
import numpy as np
from src.dataset import ML_ROOT, write_json
from src.preprocessing.audio import AudioConfig, load_audio, prepare_audio


def main():
    root = ML_ROOT / "artifacts/evaluation"
    final = json.loads((root / "final_test_evaluation.json").read_text())
    report = json.loads((ML_ROOT / "data/dataset_inspection_report.json").read_text())
    notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    results = {}
    for split in ["train", "test"]:
        for label in ["D", "Dm", "F#", "F#m"]:
            chromas = []
            for row in report["records"]:
                if row["split"] != split or row["label"] != label:
                    continue
                y, sr = load_audio(row["local_path"])
                y = prepare_audio(y, sr, AudioConfig(duration=3.0))
                chromas.append(
                    librosa.feature.chroma_stft(
                        y=y, sr=22050, n_fft=4096, hop_length=512, tuning=0.0
                    ).mean(axis=1)
                )
            results[split + "/" + label] = {
                n: float(v) for n, v in zip(notes, np.mean(chromas, axis=0))
            }
    write_json(root / "error_chroma_diagnostic.json", results)
    write_json(
        root / "misclassified_recordings.json",
        [r for r in final["predictions"] if r["actual"] != r["predicted_class"]],
    )
    print(
        "Saved post-test error diagnostics. No fitting, relabelling or threshold adjustment performed."
    )


if __name__ == "__main__":
    main()
