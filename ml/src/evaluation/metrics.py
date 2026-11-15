"""Measured multiclass and noise metrics, including explicit class support."""

from pathlib import Path
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from src.dataset import write_json


def classification_metrics(truth, prediction, class_names):
    labels = list(range(len(class_names)))
    precision, recall, f1, _ = precision_recall_fscore_support(
        truth, prediction, labels=labels, average="macro", zero_division=0
    )
    noise = class_names.index("Noise")
    truth = np.asarray(truth)
    prediction = np.asarray(prediction)
    mask = truth == noise
    chords = ~mask
    return {
        "accuracy": float(accuracy_score(truth, prediction)),
        "macro_precision": float(precision),
        "macro_recall": float(recall),
        "macro_f1": float(f1),
        "classification_report": classification_report(
            truth,
            prediction,
            labels=labels,
            target_names=class_names,
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": confusion_matrix(truth, prediction, labels=labels).tolist(),
        "noise_recall": float(np.mean(prediction[mask] == noise))
        if mask.any()
        else None,
        "noise_support": int(mask.sum()),
        "chords_predicted_as_noise_rate": float(np.mean(prediction[chords] == noise))
        if chords.any()
        else None,
        "n_recordings": len(truth),
    }


def save_metrics(path: Path, metrics, class_names, title):
    write_json(path, metrics)
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import ConfusionMatrixDisplay

    fig, ax = plt.subplots(figsize=(11, 10))
    ConfusionMatrixDisplay(
        np.array(metrics["confusion_matrix"]), display_labels=class_names
    ).plot(ax=ax, cmap="Blues", xticks_rotation=90, colorbar=False)
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path.with_suffix(".png"), dpi=140)
    plt.close(fig)
