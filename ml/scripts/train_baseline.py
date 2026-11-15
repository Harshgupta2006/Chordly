"""Compare 2/3 s SVM candidates using validation only; no test-set access."""

from pathlib import Path
import sys
import json

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import joblib
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from src.dataset import ML_ROOT, write_json
from src.preprocessing.prepare import verified_report, create_split, PROCESSED
from src.evaluation.metrics import classification_metrics, save_metrics
from src.features.baseline import BASELINE_FEATURE_CONFIG


def main():
    report = verified_report()
    split = create_split()
    root = ML_ROOT / "artifacts/baseline"
    root.mkdir(parents=True, exist_ok=True)
    if (root / "model.joblib").exists():
        raise RuntimeError(
            "Baseline artifact already exists; preserve it, use a new experiment directory for retraining"
        )
    experiments = []
    best = None
    for duration in [2.0, 3.0]:
        train = np.load(PROCESSED / f"train_{duration:g}s.npz")
        val = np.load(PROCESSED / f"validation_{duration:g}s.npz")
        for c in [1.0, 10.0, 100.0]:
            for gamma in ["scale", 0.001]:
                model = make_pipeline(
                    StandardScaler(),
                    SVC(C=c, gamma=gamma, class_weight="balanced", random_state=42),
                )
                model.fit(train["baseline"], train["labels"])
                metrics = classification_metrics(
                    val["labels"], model.predict(val["baseline"]), report["class_names"]
                )
                config = {
                    "duration": duration,
                    "C": c,
                    "gamma": gamma,
                    "class_weight": "balanced",
                    "seed": 42,
                }
                experiments.append({"config": config, "metrics": metrics})
                print(
                    f"SVM {config}: validation accuracy={metrics['accuracy']:.4f}, macro F1={metrics['macro_f1']:.4f}",
                    flush=True,
                )
                if best is None or metrics["macro_f1"] > best["metrics"]["macro_f1"]:
                    best = {
                        "model": model,
                        "config": config,
                        "metrics": metrics,
                        "feature_config": json.loads(str(train["config"])),
                    }
    write_json(root / "validation_experiments.json", experiments)
    payload = {k: v for k, v in best.items() if k != "metrics"}
    payload["class_names"] = report["class_names"]
    payload["baseline_feature_config"] = BASELINE_FEATURE_CONFIG
    payload["split_manifest"] = split
    joblib.dump(payload, root / "model.joblib")
    save_metrics(
        root / "validation_metrics.json",
        best["metrics"],
        report["class_names"],
        "SVM validation (selection data)",
    )
    write_json(
        root / "selected_config.json",
        {
            "svm": best["config"],
            "features": best["feature_config"],
            "baseline_feature_extraction": BASELINE_FEATURE_CONFIG,
            "selection_metric": "validation macro F1",
            "validation_selection_bias": "12 candidates compared on one validation split; performance is optimistic until one final test evaluation.",
        },
    )


if __name__ == "__main__":
    main()
