"""Reproducible training, validation, early stopping and resumable local checkpoints."""

import json
import os
from pathlib import Path
import random
import time

os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from src.dataset import ML_ROOT, write_json
from src.models.cnn import ChordCNN
from src.preprocessing.prepare import PROCESSED, create_split, verified_report
from src.evaluation.metrics import classification_metrics, save_metrics


def seed_all(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = False
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(2)


def choose_threshold(truth, scores, names):
    predicted = scores.argmax(axis=1)
    confidence = scores.max(axis=1)
    rows = []
    for threshold in np.arange(0.3, 0.96, 0.05):
        accepted = (confidence >= threshold) & (predicted != names.index("Noise"))
        count = int(accepted.sum())
        precision = (
            float(np.mean(predicted[accepted] == truth[accepted])) if count else None
        )
        rows.append(
            {
                "threshold": round(float(threshold), 2),
                "accepted": count,
                "accuracy_on_accepted": precision,
                "coverage": count / len(truth),
            }
        )
    candidates = [
        r for r in rows if r["accepted"] >= 10 and r["accuracy_on_accepted"] >= 0.95
    ]
    best = (
        max(candidates, key=lambda r: r["coverage"])
        if candidates
        else {
            "threshold": 0.95,
            "accepted": 0,
            "coverage": 0.0,
            "accuracy_on_accepted": None,
        }
    )
    return {
        "threshold": best["threshold"],
        "validation_selection": best,
        "candidates": rows,
        "method": "Maximum validation coverage subject to >=95% observed accepted accuracy, at least 10 accepted recordings; fallback .95 if infeasible.",
        "warning": "Softmax scores are uncalibrated. This small validation sample gives no accuracy or out-of-distribution guarantee.",
    }


def train(
    epochs=80,
    batch_size=16,
    learning_rate=0.001,
    patience=15,
    seed=42,
    amp=False,
    resume=False,
    output=None,
):
    report = verified_report()
    split = create_split()
    baseline = ML_ROOT / "artifacts/baseline/selected_config.json"
    if not baseline.exists():
        raise RuntimeError(
            "A functional evaluated baseline is required before CNN training"
        )
    duration = json.loads(baseline.read_text())["svm"]["duration"]
    root = Path(output) if output else ML_ROOT / "artifacts/cnn"
    root.mkdir(parents=True, exist_ok=True)
    last_path = root / "last.pt"
    best_path = root / "best.pt"
    if best_path.exists() and not resume:
        raise RuntimeError(
            "Existing CNN checkpoint preserved; use --resume or a new --output directory"
        )
    seed_all(seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    amp = bool(amp and device.type == "cuda")
    training = np.load(PROCESSED / f"train_{duration:g}s.npz")
    validation = np.load(PROCESSED / f"validation_{duration:g}s.npz")
    mean = training["mel"].mean(axis=(0, 2), keepdims=True)
    std = training["mel"].std(axis=(0, 2), keepdims=True).clip(0.001)
    config = {
        "audio": json.loads(str(training["config"]))["audio"],
        "mel": json.loads(str(training["config"]))["mel"],
        "class_names": report["class_names"],
        "seed": seed,
        "batch_size": batch_size,
        "learning_rate": learning_rate,
        "max_epochs": epochs,
        "patience": patience,
        "amp": amp,
        "device": str(device),
        "normalization": {"mean": mean.ravel().tolist(), "std": std.ravel().tolist()},
        "architecture": "ChordCNN-v1",
        "weights_origin": "random initialization; no pretrained weights",
        "augmentation": "none for initial controlled experiment",
        "class_weighting": "inverse square root of training recording counts",
        "dataset_revision": report["revision"],
        "split_manifest": split,
    }

    def tensors(dataset):
        x = ((dataset["mel"] - mean) / std)[:, None].astype(np.float32)
        return TensorDataset(
            torch.from_numpy(x), torch.from_numpy(dataset["labels"]).long()
        )

    generator = torch.Generator().manual_seed(seed)
    train_loader = DataLoader(
        tensors(training),
        batch_size=batch_size,
        shuffle=True,
        generator=generator,
        num_workers=0,
        pin_memory=device.type == "cuda",
    )
    val_loader = DataLoader(tensors(validation), batch_size=batch_size, num_workers=0)
    model = ChordCNN(len(report["class_names"]), training["mel"].shape[1]).to(device)
    counts = np.bincount(training["labels"], minlength=len(report["class_names"]))
    weights = torch.tensor(
        np.sqrt(len(training["labels"]) / (len(counts) * counts)),
        dtype=torch.float32,
        device=device,
    )
    criterion = nn.CrossEntropyLoss(weight=weights)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=learning_rate, weight_decay=0.0001
    )
    scaler = torch.amp.GradScaler("cuda", enabled=amp)
    start = 0
    best_score = -1.0
    best_loss = float("inf")
    stale = 0
    history = []
    if resume:
        # This is our own trusted local training state, never an uploaded file.
        state = torch.load(last_path, map_location="cpu", weights_only=False)
        for field in [
            "audio",
            "mel",
            "class_names",
            "seed",
            "batch_size",
            "learning_rate",
            "architecture",
            "dataset_revision",
        ]:
            if state["config"][field] != config[field]:
                raise ValueError(f"Resume configuration mismatch: {field}")
        model.load_state_dict(state["model"])
        optimizer.load_state_dict(state["optimizer"])
        scaler.load_state_dict(state["scaler"])
        start = state["epoch"] + 1
        best_score = state["best_score"]
        best_loss = state["best_loss"]
        stale = state["stale"]
        history = state["history"]
        torch.set_rng_state(state["torch_rng"])
        np.random.set_state(state["numpy_rng"])
        random.setstate(state["python_rng"])
        generator.set_state(state["loader_rng"])
        if device.type == "cuda":
            torch.cuda.set_rng_state_all(state["cuda_rng"])
    write_json(root / "config.json", config)
    print(
        f"Training from random weights: {sum(p.numel() for p in model.parameters()):,} parameters; {device}; AMP={amp}; batch={batch_size}",
        flush=True,
    )
    start_time = time.perf_counter()
    for epoch in range(start, epochs):
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats()
        model.train()
        loss_sum = 0.0
        correct = 0
        total = 0
        for x, y in train_loader:
            x = x.to(device)
            y = y.to(device)
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device.type, enabled=amp):
                logits = model(x)
                loss = criterion(logits, y)
            if not torch.isfinite(loss):
                raise RuntimeError("Non-finite training loss")
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            scaler.step(optimizer)
            scaler.update()
            loss_sum += float(loss.detach()) * len(y)
            correct += int((logits.argmax(1) == y).sum())
            total += len(y)
        model.eval()
        val_loss = 0.0
        all_logits = []
        with torch.inference_mode():
            for x, y in val_loader:
                x = x.to(device)
                y = y.to(device)
                logits = model(x)
                val_loss += float(criterion(logits, y)) * len(y)
                all_logits.append(logits.cpu())
        scores = torch.cat(all_logits).softmax(1).numpy()
        metrics = classification_metrics(
            validation["labels"], scores.argmax(1), report["class_names"]
        )
        row = {
            "epoch": epoch + 1,
            "train_loss": loss_sum / total,
            "train_accuracy": correct / total,
            "validation_loss": val_loss / len(validation["labels"]),
            "validation_accuracy": metrics["accuracy"],
            "validation_macro_f1": metrics["macro_f1"],
            "gpu_peak_allocated_mib": torch.cuda.max_memory_allocated() / 2**20
            if device.type == "cuda"
            else 0.0,
            "elapsed_seconds": time.perf_counter() - start_time,
        }
        history.append(row)
        score = metrics["macro_f1"]
        improved = score > best_score + 1e-8 or (
            abs(score - best_score) <= 1e-8 and row["validation_loss"] < best_loss
        )
        if improved:
            best_score = score
            best_loss = row["validation_loss"]
            stale = 0
            torch.save(
                {k: v.detach().cpu() for k, v in model.state_dict().items()}, best_path
            )
            write_json(root / "best_epoch.json", row)
        else:
            stale += 1
        state = {
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "scaler": scaler.state_dict(),
            "epoch": epoch,
            "config": config,
            "best_score": best_score,
            "best_loss": best_loss,
            "stale": stale,
            "history": history,
            "torch_rng": torch.get_rng_state(),
            "numpy_rng": np.random.get_state(),
            "python_rng": random.getstate(),
            "loader_rng": generator.get_state(),
            "cuda_rng": torch.cuda.get_rng_state_all() if device.type == "cuda" else [],
        }
        torch.save(state, last_path)
        write_json(root / "history.json", history)
        print(
            f"Epoch {epoch + 1:3}: train loss={row['train_loss']:.4f} acc={row['train_accuracy']:.3f}; val loss={row['validation_loss']:.4f} acc={metrics['accuracy']:.3f} F1={score:.3f}; GPU peak={row['gpu_peak_allocated_mib']:.0f} MiB",
            flush=True,
        )
        if stale >= patience:
            print("Early stopping", flush=True)
            break
    model.load_state_dict(torch.load(best_path, map_location=device, weights_only=True))
    model.eval()
    with torch.inference_mode():
        scores = torch.cat(
            [model(x.to(device)).softmax(1).cpu() for x, _ in val_loader]
        ).numpy()
    metrics = classification_metrics(
        validation["labels"], scores.argmax(1), report["class_names"]
    )
    save_metrics(
        root / "validation_metrics.json",
        metrics,
        report["class_names"],
        "CNN best checkpoint validation (selection data)",
    )
    write_json(
        root / "rejection.json",
        choose_threshold(validation["labels"], scores, report["class_names"]),
    )
    np.savez_compressed(
        root / "validation_predictions.npz",
        truth=validation["labels"],
        scores=scores,
        paths=validation["paths"],
    )
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    for field, label in [("train_loss", "train"), ("validation_loss", "validation")]:
        axes[0].plot(
            [r["epoch"] for r in history], [r[field] for r in history], label=label
        )
    for field, label in [
        ("train_accuracy", "train"),
        ("validation_accuracy", "validation"),
    ]:
        axes[1].plot(
            [r["epoch"] for r in history], [r[field] for r in history], label=label
        )
    axes[0].set(title="Loss", xlabel="Epoch")
    axes[1].set(title="Accuracy", xlabel="Epoch", ylim=(0, 1))
    axes[0].legend()
    axes[1].legend()
    fig.tight_layout()
    fig.savefig(root / "learning_curves.png", dpi=140)
    plt.close(fig)
    return metrics
