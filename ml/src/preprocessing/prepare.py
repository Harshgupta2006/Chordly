"""Freeze recording-level train/validation assignment before extracting windows."""

from collections import Counter
import json
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

from src.dataset import ML_ROOT, REVISION, write_json
from src.exploration import REPORT
from src.features.baseline import aggregate_features
from src.features.spectral import MelConfig, log_mel
from src.preprocessing.audio import AudioConfig, load_audio, prepare_audio

PROCESSED = ML_ROOT / "data/processed"
SPLIT_FILE = PROCESSED / "split_manifest.json"


def verified_report():
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    if (
        not report.get("inventory_verified")
        or not report.get("eda_verified")
        or report["revision"] != REVISION
    ):
        raise RuntimeError(
            "Finish and verify the pinned dataset EDA before preprocessing/training"
        )
    for name in report["eda_figures"]:
        if not (ML_ROOT / "data/eda_output" / name).exists():
            raise RuntimeError(f"Missing EDA output {name}")
    return report


def create_split(seed=42):
    report = verified_report()
    rows = [r for r in report["records"] if r["split"] == "train"]
    if SPLIT_FILE.exists():
        existing = json.loads(SPLIT_FILE.read_text())
        if existing["seed"] != seed or existing["revision"] != REVISION:
            raise ValueError(
                "Existing split differs; preserve it and use an explicit new experiment directory"
            )
        return existing
    train, val = train_test_split(
        np.arange(len(rows)),
        test_size=0.2,
        random_state=seed,
        stratify=[r["label"] for r in rows],
    )

    def select(indices):
        return [rows[int(i)]["path"] for i in indices]

    parts = {"train": select(train), "validation": select(val)}

    def hashes(paths):
        return {r["pcm_sha256"] for r in rows if r["path"] in paths}

    if hashes(parts["train"]) & hashes(parts["validation"]):
        raise ValueError(
            "Duplicate recordings across training and validation; grouped allocation required"
        )
    result = {
        "revision": REVISION,
        "seed": seed,
        "parts": parts,
        "class_names": report["class_names"],
        "counts": {
            s: dict(Counter(r["label"] for r in rows if r["path"] in paths))
            for s, paths in parts.items()
        },
        "split_unit": "original recording; derived windows stay in the original recording partition",
        "grouping_limitations": "No trustworthy session IDs. Exact PCM duplicates checked; filename take indices are protocol positions, not verified sessions. Correlated guitar/player/source leakage cannot be excluded.",
    }
    write_json(SPLIT_FILE, result)
    return result


def prepare_all(durations=(2.0, 3.0)):
    report = verified_report()
    split = create_split()
    rows = {r["path"]: r for r in report["records"] if r["split"] == "train"}
    labels = report["label_to_index"]
    PROCESSED.mkdir(parents=True, exist_ok=True)
    for duration in durations:
        config = AudioConfig(duration=duration)
        mel_config = MelConfig()
        for part, paths in split["parts"].items():
            output = PROCESSED / f"{part}_{duration:g}s.npz"
            if output.exists():
                expected = {
                    "audio": config.to_dict(),
                    "mel": mel_config.to_dict(),
                    "revision": REVISION,
                }
                with np.load(output) as cached:
                    if (
                        json.loads(str(cached["config"])) != expected
                        or cached["paths"].tolist() != paths
                    ):
                        raise ValueError(
                            f"Cached preprocessing configuration/split differs: {output}. Preserve it and use a new experiment directory."
                        )
                    if (
                        not np.isfinite(cached["mel"]).all()
                        or not np.isfinite(cached["baseline"]).all()
                    ):
                        raise ValueError(f"Non-finite cached features: {output}")
                print(f"Using existing {output.name}", flush=True)
                continue
            mel, baseline, target = [], [], []
            for i, path in enumerate(paths, 1):
                row = rows[path]
                y, sr = load_audio(row["local_path"])
                y = prepare_audio(y, sr, config)
                mel.append(log_mel(y, config.sample_rate, mel_config))
                baseline.append(aggregate_features(y, config.sample_rate))
                target.append(labels[row["label"]])
                if i % 100 == 0:
                    print(f"{part} {duration:g}s: {i}/{len(paths)}", flush=True)
            np.savez_compressed(
                output,
                mel=np.stack(mel),
                baseline=np.stack(baseline),
                labels=np.asarray(target),
                paths=np.asarray(paths),
                config=json.dumps(
                    {
                        "audio": config.to_dict(),
                        "mel": mel_config.to_dict(),
                        "revision": REVISION,
                    }
                ),
            )
            print(
                f"Saved {output.name}: {len(paths)} independent recordings", flush=True
            )
    return split
