"""Auditable dataset inventory and training-only exploratory figures (no training)."""

from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys

import librosa
import numpy as np
import soundfile as sf

from src.dataset import (
    ML_ROOT,
    REPO_ID,
    REVISION,
    audio_entries,
    remote_inventory,
    verify_download,
    write_json,
)
from src.preprocessing.audio import (
    AudioConfig,
    activity_profile,
    load_audio,
    prepare_audio,
    resample,
)
from src.features.spectral import MelConfig, log_mel

OUTPUT = ML_ROOT / "data" / "eda_output"
REPORT = ML_ROOT / "data" / "dataset_inspection_report.json"


def canonical_compatibility(labels):
    # Fail visibly when backend definitions cannot be imported.
    sys.path.insert(0, str(ML_ROOT.parent / "backend"))
    from app.chords import CANONICAL_CHORDS, UnknownChordError, normalize_chord

    fingerings = {
        c["name"]
        for c in json.loads((ML_ROOT.parent / "frontend/data/chords.json").read_text())
    }
    compatibility = {}
    for label in labels:
        if label == "Noise":
            compatibility[label] = {
                "canonical": None,
                "supported": False,
                "reason": "non_chord",
            }
            continue
        try:
            chord = normalize_chord(label)
            supported = chord in fingerings
            compatibility[label] = {
                "canonical": chord,
                "supported": supported,
                "reason": "supported" if supported else "missing_frontend_fingering",
            }
        except UnknownChordError:
            compatibility[label] = {
                "canonical": None,
                "supported": False,
                "reason": "unknown_chord",
            }
    return {
        "backend_canonical_count": len(CANONICAL_CHORDS),
        "frontend_fingering_count": len(fingerings),
        "labels": compatibility,
    }


def summary(values):
    a = np.asarray([x for x in values if x is not None], dtype=float)
    if not len(a):
        return None
    return {
        "n": len(a),
        "min": float(a.min()),
        "median": float(np.median(a)),
        "mean": float(a.mean()),
        "p95": float(np.percentile(a, 95)),
        "max": float(a.max()),
    }


def inspect_dataset() -> dict:
    manifest = remote_inventory()
    records, errors = [], []
    entries = audio_entries(manifest)
    labels = sorted({e["label"] for e in entries})
    for index, entry in enumerate(entries, 1):
        row = {k: entry[k] for k in ("path", "local_path", "split", "label")}
        try:
            verify_download(entry)
            info = sf.info(entry["local_path"])
            y, sr = load_audio(entry["local_path"])
            reduced = resample(y, sr, 22050)
            rms, activity, end = activity_profile(reduced, 22050, AudioConfig())
            # Test audio is inspected for integrity, never used to choose transforms.
            onset = None
            onset_status = (
                "not_run_on_test" if entry["split"] == "test" else "noise_not_a_strum"
            )
            if entry["split"] == "train" and entry["label"] != "Noise":
                onsets = librosa.onset.onset_detect(
                    y=reduced, sr=22050, units="time", backtrack=True
                )
                onset = float(onsets[0]) if len(onsets) else None
                onset_status = "detected" if onset is not None else "not_detected"
            match = re.search(r"_(\d+)\.wav$", entry["path"], re.I)
            source = (
                "garage_band"
                if "garage_band" in entry["path"]
                else ("fender" if "fender" in entry["path"] else "noise_source")
            )
            row.update(
                sample_rate=sr,
                channels=info.channels,
                subtype=info.subtype,
                duration_s=info.duration,
                frames=info.frames,
                peak=float(np.max(np.abs(y))),
                rms=float(np.sqrt(np.mean(y.astype(np.float64) ** 2))),
                clipped_fraction=float(np.mean(np.abs(y) >= 0.999)),
                silent_fraction=float(np.mean(rms < AudioConfig().activity_threshold)),
                activity_start_s=activity,
                activity_end_s=end,
                onset_s=onset,
                onset_status=onset_status,
                source=source,
                take_index=int(match[1]) if match else None,
                pcm_sha256=hashlib.sha256(
                    str(sr).encode() + y.astype("<f4").tobytes()
                ).hexdigest(),
                status="ok",
            )
        except Exception as exc:
            row.update(status="error", error_type=type(exc).__name__, error=str(exc))
            errors.append({"path": entry["path"], "error": str(exc)})
        records.append(row)
        if index % 50 == 0 or index == len(entries):
            print(f"Inspected {index}/{len(entries)}; errors={len(errors)}", flush=True)
    duplicates = defaultdict(list)
    for r in records:
        if r["status"] == "ok":
            duplicates[r["pcm_sha256"]].append(r)
    groups = [
        [r["path"] for r in rows] for rows in duplicates.values() if len(rows) > 1
    ]
    cross_split = [
        [r["path"] for r in rows]
        for rows in duplicates.values()
        if len({r["split"] for r in rows}) > 1
    ]
    conflicting = [
        [r["path"] for r in rows]
        for rows in duplicates.values()
        if len({r["label"] for r in rows}) > 1
    ]
    expected = {
        p + s
        for p in ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"]
        for s in ["", "m"]
    } | {"Noise"}
    counts = {
        s: dict(sorted(Counter(r["label"] for r in records if r["split"] == s).items()))
        for s in ["train", "test"]
    }
    blockers = []
    if errors:
        blockers.append("Missing/malformed/unreadable/hash-mismatched audio")
    if set(labels) != expected:
        blockers.append("Unexpected label set")
    if any(set(c) != set(labels) for c in counts.values()):
        blockers.append("A split is missing labels")
    if cross_split:
        blockers.append("Exact decoded audio appears in both official splits")
    if conflicting:
        blockers.append("Identical decoded audio has conflicting labels")
    good = [r for r in records if r["status"] == "ok"]
    report = {
        "dataset": REPO_ID,
        "revision": REVISION,
        "license": manifest["card"].get("license"),
        "attribution": "Isolated Guitar Chords by rodriler (derived from severyn-k), CC BY 4.0; https://huggingface.co/datasets/rodriler/isolated-guitar-chords. Changes: decoding, resampling, activity crop, feature extraction.",
        "class_names": labels,
        "label_to_index": {c: i for i, c in enumerate(labels)},
        "class_count": len(labels),
        "expected_classes_verified": set(labels) == expected,
        "per_class_counts": counts,
        "splits": {s: sum(c.values()) for s, c in counts.items()},
        "sample_rates": dict(Counter(str(r["sample_rate"]) for r in good)),
        "channels": dict(Counter(str(r["channels"]) for r in good)),
        "subtypes": dict(Counter(r["subtype"] for r in good)),
        "duration_summary": {
            s: summary(r["duration_s"] for r in good if r["split"] == s)
            for s in ["train", "test"]
        },
        "train_onset_summary": summary(
            r["onset_s"]
            for r in good
            if r["split"] == "train" and r["label"] != "Noise"
        ),
        "errors": errors,
        "duplicate_pcm_groups": groups,
        "cross_split_duplicates": cross_split,
        "conflicting_labels": conflicting,
        "canonical_compatibility": canonical_compatibility(labels),
        "records": records,
        "inventory_verified": not blockers,
        "blockers": blockers,
        "limitations": [
            "Only 3 Noise examples per official split: noise metrics have high uncertainty.",
            "Am and E each include 15 GarageBand files, explaining 40 rather than 25 training examples.",
            "Fender source is a single guitar/player; filename take numbers do not establish independent recording sessions.",
            "Exact PCM hashing detects duplicates, not all related or nearly identical takes.",
            "Official test waveforms are inspected for integrity only; EDA figures and choices use training audio.",
        ],
    }
    write_json(REPORT, report)
    write_json(OUTPUT / "invalid_samples.json", errors)
    write_json(
        OUTPUT / "canonical_compatibility.json", report["canonical_compatibility"]
    )
    print(
        json.dumps(
            {
                k: report[k]
                for k in [
                    "splits",
                    "class_count",
                    "sample_rates",
                    "inventory_verified",
                    "blockers",
                ]
            },
            indent=2,
        )
    )
    return report


def run_eda(report=None):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import librosa.display

    report = report or json.loads(REPORT.read_text(encoding="utf-8"))
    if not report["inventory_verified"]:
        raise RuntimeError(f"Inventory quality gate failed: {report['blockers']}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = report["records"]
    train = [r for r in records if r["split"] == "train"]

    def save(fig, name):
        fig.tight_layout()
        fig.savefig(OUTPUT / name, dpi=140)
        plt.close(fig)

    labels = report["class_names"]
    x = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(13, 4))
    for offset, split in [(-0.2, "train"), (0.2, "test")]:
        ax.bar(
            x + offset,
            [report["per_class_counts"][split][c] for c in labels],
            width=0.4,
            label=split,
        )
    ax.set(
        xticks=x,
        xticklabels=labels,
        ylabel="Recordings",
        title="Actual class distribution (pinned revision)",
    )
    ax.legend()
    save(fig, "class_distribution.png")
    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    for split in ["train", "test"]:
        axes[0].hist(
            [r["duration_s"] for r in records if r["split"] == split],
            bins=30,
            alpha=0.6,
            label=split,
        )
    axes[0].set(xlabel="Seconds", ylabel="Count", title="Original recording duration")
    axes[0].legend()
    rates = report["sample_rates"]
    axes[1].bar(list(rates), list(rates.values()))
    axes[1].set(xlabel="Hz", ylabel="Count", title="Sample-rate distribution")
    save(fig, "duration_distribution.png")
    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    axes[0].hist([r["onset_s"] for r in train if r["onset_s"] is not None], bins=30)
    axes[0].set(xlabel="Seconds", title="Training strum onset (librosa)")
    axes[1].hist(
        [r["activity_start_s"] for r in train if r["activity_start_s"] is not None],
        bins=30,
    )
    axes[1].set(
        xlabel="Seconds", title="Training activity start (absolute + relative RMS gate)"
    )
    save(fig, "onset_distribution.png")

    representatives = []
    for label in ["A", "Am", "E", "C", "G#m", "Noise"]:
        representatives.append(
            next(
                r
                for r in train
                if r["label"] == label and (r["source"] == "fender" or label == "Noise")
            )
        )
    fig, axes = plt.subplots(len(representatives), 1, figsize=(12, 12))
    window_metrics = []
    for ax, row in zip(axes, representatives):
        y, sr = load_audio(row["local_path"])
        t = np.arange(len(y)) / sr
        ax.plot(t, y, lw=0.4)
        ax.set(
            title=f"{row['label']} — {Path(row['path']).name}",
            xlabel="Seconds",
            ylim=(-1, 1),
        )
        if row["activity_start_s"] is not None:
            ax.axvline(row["activity_start_s"], color="red", label="activity")
        if row["onset_s"] is not None:
            ax.axvline(row["onset_s"], color="green", ls="--", label="strum onset")
        if row["activity_start_s"] is not None:
            ax.legend(loc="upper right")
    save(fig, "waveform_and_onset.png")

    fig, axes = plt.subplots(len(representatives), 2, figsize=(12, 14))
    for i, row in enumerate(representatives):
        y, sr = load_audio(row["local_path"])
        for j, duration in enumerate([2.0, 3.0]):
            cfg = AudioConfig(duration=duration)
            prepared = prepare_audio(y, sr, cfg)
            db = log_mel(prepared, cfg.sample_rate)
            im = librosa.display.specshow(
                db,
                sr=cfg.sample_rate,
                hop_length=512,
                x_axis="time",
                y_axis="mel",
                ax=axes[i, j],
                vmin=-100,
                vmax=30,
            )
            axes[i, j].set_title(
                f"{row['label']} / {duration:g} seconds / fixed dB reference"
            )
    fig.colorbar(im, ax=axes.ravel().tolist(), label="dB re power=1", fraction=0.015)
    fig.subplots_adjust(hspace=0.65, wspace=0.3, right=0.85)
    fig.savefig(OUTPUT / "two_vs_three_seconds.png", dpi=140)
    plt.close(fig)

    # Quantify retained energy for all training recordings, not just examples.
    for row in train:
        y, sr = load_audio(row["local_path"])
        reduced = resample(y, sr, 22050)
        _, start, _ = activity_profile(reduced, 22050, AudioConfig())
        begin = max(0, round(((start or 0) - 0.04) * 22050))
        total = float(np.sum(reduced[begin:].astype(float) ** 2))
        item = {"path": row["path"], "label": row["label"]}
        for duration in [2, 3]:
            window = prepare_audio(y, sr, AudioConfig(duration=float(duration)))
            item[f"energy_fraction_{duration}s"] = (
                float(np.sum(window.astype(float) ** 2) / total) if total > 0 else None
            )
        window_metrics.append(item)
    write_json(OUTPUT / "window_comparison.json", window_metrics)

    row = next(r for r in representatives if r["label"] == "A")
    y, sr = load_audio(row["local_path"])
    y = prepare_audio(y, sr, AudioConfig())
    sr = 22050
    mel = log_mel(y, sr)
    cqt = librosa.amplitude_to_db(
        np.abs(librosa.cqt(y, sr=sr, hop_length=512, n_bins=84)), ref=1.0, top_db=None
    )
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=512)
    fig, axes = plt.subplots(3, 1, figsize=(11, 9))
    for ax, data, title, axis in zip(
        axes,
        [mel, cqt, chroma],
        [
            "Log-Mel (fixed power reference)",
            "CQT (fixed amplitude reference)",
            "Chroma (relative pitch classes)",
        ],
        ["mel", "cqt_note", "chroma"],
    ):
        im = librosa.display.specshow(
            data, sr=sr, hop_length=512, x_axis="time", y_axis=axis, ax=ax
        )
        ax.set_title(title)
        fig.colorbar(im, ax=ax)
    save(fig, "mel_vs_cqt_vs_chroma.png")
    fig, axes = plt.subplots(2, 1, figsize=(11, 7))
    for ax, row in zip(axes, [representatives[0], representatives[-1]]):
        y, sr = load_audio(row["local_path"])
        y = prepare_audio(y, sr, AudioConfig())
        im = librosa.display.specshow(
            log_mel(y, 22050),
            sr=22050,
            hop_length=512,
            x_axis="time",
            y_axis="mel",
            ax=ax,
            vmin=-100,
            vmax=30,
        )
        ax.set_title(row["label"] + " — same class-independent crop, gain and dB scale")
        fig.colorbar(im, ax=ax)
    save(fig, "chord_vs_noise.png")
    report["eda_verified"] = True
    report["audio_config"] = AudioConfig().to_dict()
    report["source_quality_flags"] = [
        {"path": r["path"], "clipped_fraction": r["clipped_fraction"]}
        for r in records
        if r["clipped_fraction"] > 0.01
    ]
    report["eda_figures"] = sorted(p.name for p in OUTPUT.glob("*.png"))
    report["window_energy_summary"] = {
        str(d): summary(
            r[f"energy_fraction_{d}s"] for r in window_metrics if r["label"] != "Noise"
        )
        for d in [2, 3]
    }
    write_json(REPORT, report)
    print("EDA figures generated; no model training performed.", flush=True)
    return report
