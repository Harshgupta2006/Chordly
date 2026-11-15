"""One final official-test evaluation after all model/threshold choices are frozen."""

from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import joblib
import numpy as np
from src.dataset import ML_ROOT, write_json, file_sha256
from src.preprocessing.prepare import verified_report
from src.preprocessing.audio import AudioConfig, load_audio, prepare_audio
from src.features.baseline import aggregate_features
from src.inference.predictor import Predictor
from src.evaluation.metrics import classification_metrics, save_metrics


def main():
    report = verified_report()
    root = ML_ROOT / "artifacts/evaluation"
    root.mkdir(parents=True, exist_ok=True)
    output = root / "final_test_evaluation.json"
    hashes = {
        name: file_sha256(ML_ROOT / path)
        for name, path in {
            "svm": "artifacts/baseline/model.joblib",
            "cnn": "artifacts/cnn/best.pt",
            "cnn_config": "artifacts/cnn/config.json",
            "rejection": "artifacts/cnn/rejection.json",
        }.items()
    }
    if output.exists():
        saved = json.loads(output.read_text())
        if saved["artifact_hashes"] != hashes:
            raise RuntimeError(
                "Test set already evaluated with different artifacts. Do not tune repeatedly against it."
            )
        print(
            "Existing immutable final test results:",
            json.dumps(saved["summary"], indent=2),
        )
        return
    predictor = Predictor()
    baseline = joblib.load(ML_ROOT / "artifacts/baseline/model.joblib")
    config = AudioConfig(**baseline["feature_config"]["audio"])
    rows = [r for r in report["records"] if r["split"] == "test"]
    truth = []
    svm = []
    cnn = []
    predictions = []
    cnn_scores = []
    for i, row in enumerate(rows, 1):
        y, sr = load_audio(row["local_path"])
        features = aggregate_features(prepare_audio(y, sr, config), config.sample_rate)
        baseline_label = int(baseline["model"].predict(features[None])[0])
        result = predictor.predict(y, sr)
        label = report["label_to_index"][result["predicted_class"]]
        truth.append(report["label_to_index"][row["label"]])
        svm.append(baseline_label)
        cnn.append(label)
        cnn_scores.append(list(result["class_scores"].values()))
        predictions.append(
            {
                "path": row["path"],
                "actual": row["label"],
                "svm": report["class_names"][baseline_label],
                **result,
            }
        )
        if i % 30 == 0:
            print(f"Final test inference {i}/{len(rows)}", flush=True)
    summaries = {}
    for name, prediction in [("svm", svm), ("cnn", cnn)]:
        metrics = classification_metrics(truth, prediction, report["class_names"])
        save_metrics(
            root / f"{name}_test_metrics.json",
            metrics,
            report["class_names"],
            f"{name.upper()} official test (one final evaluation)",
        )
        summaries[name] = {
            k: v
            for k, v in metrics.items()
            if k not in ["classification_report", "confusion_matrix"]
        }
    accepted = [i for i, p in enumerate(predictions) if p["status"] == "ok"]
    rejection = {
        "accepted": len(accepted),
        "coverage": len(accepted) / len(rows),
        "accuracy_on_accepted": float(
            np.mean(np.asarray(truth)[accepted] == np.asarray(cnn)[accepted])
        )
        if accepted
        else None,
        "status_counts": {
            status: sum(p["status"] == status for p in predictions)
            for status in ["ok", "uncertain", "noise", "silence", "unsupported"]
        },
    }
    save = {
        "dataset_revision": report["revision"],
        "artifact_hashes": hashes,
        "summary": summaries,
        "rejection": rejection,
        "predictions": predictions,
        "test_used_for_selection": False,
        "limitations": report["limitations"]
        + [
            "Threshold fitted on a small reused validation split; scores are not calibrated.",
            "Clipped source recordings retained and reported; no personal guitar generalization results yet.",
        ],
    }
    write_json(output, save)
    print(json.dumps({"test_results": summaries, "rejection": rejection}, indent=2))


if __name__ == "__main__":
    main()
