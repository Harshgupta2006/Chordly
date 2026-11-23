"""Local second pilot: select for quiet-chord recognition under louder fans."""

import argparse
from collections import Counter
import json
from pathlib import Path
import shutil

import numpy as np
from threadpoolctl import threadpool_limits
from finetune_public import evaluate, examples, tensors, verified_sources
from src.dataset import ML_ROOT, file_sha256, write_json
from src.inference.predictor import Predictor
from src.training.cnn import seed_all
import torch
from torch.utils.data import DataLoader

EXTRA_SNRS = (-3, 0, 3, 6, 9, 15)


def validation_scores(predictor, clips, original):
    results = evaluate(predictor, clips)["summary"]
    with torch.inference_mode():
        predictions = torch.cat([predictor.model(x.to(predictor.device)).argmax(1).cpu()
                                 for x in original[0].split(64)])
    return {kind: results[kind]["correct_chord"] for kind in ("clean", "quiet", "mixed")} | {
        "fan_false_accepts": results["fan"]["noise_false_acceptances"],
        "mixed_wrong": results["mixed"]["accepted_chord_recordings"] - results["mixed"]["correct_chord"],
        "original_correct": int((predictions == original[1]).sum()),
    }


def eligible(scores, baseline):
    # Guardrails are fixed before training. Allow a single clip of sampling variation.
    return (scores["fan_false_accepts"] <= baseline["fan_false_accepts"]
            and scores["original_correct"] >= baseline["original_correct"] - 1
            and scores["mixed_wrong"] <= baseline["mixed_wrong"] + 1
            and all(scores[k] >= baseline[k] - 1 for k in ("clean", "quiet")))


def run(output):
    parent = ML_ROOT / "artifacts/fan-pilot-01"
    fans = verified_sources()
    first = json.loads((parent / "experiment.json").read_text())
    if first["candidate_sha256"] != file_sha256(parent / "best.pt") or first["fans"] != fans:
        raise ValueError("Expected the first pilot and its verified public sources")
    seed_all(63)
    predictor = Predictor(parent)
    output.mkdir(parents=True, exist_ok=False)
    train, kinds = tensors(predictor, "train", fans, training_snrs=EXTRA_SNRS)
    val = list(examples("validation", fans))
    with np.load(ML_ROOT / "data/processed/validation_3s.npz") as data:
        if data["paths"].tolist() != predictor.config["split_manifest"]["parts"]["validation"]:
            raise ValueError("Original validation recording IDs changed")
        x = (data["mel"] - predictor.mean) / predictor.std
        original = torch.from_numpy(x[:, None]), torch.from_numpy(data["labels"])
    baseline = validation_scores(predictor, val, original)
    best = baseline["mixed"]
    selected = 0
    shutil.copyfile(parent / "best.pt", output / "best.pt")
    counts = Counter(kinds)
    weights = [(2 if k == "mixed" else 1) / counts[k] for k in kinds]
    steps = len(kinds) - counts["mixed"] + counts["clean"]
    optimizer = torch.optim.AdamW(predictor.model.parameters(), lr=0.00005)
    sampler = torch.utils.data.WeightedRandomSampler(weights, steps, replacement=True)
    loader = DataLoader(train, batch_size=32, sampler=sampler)
    history = []
    print("Parent validation:", baseline, flush=True)
    for epoch in range(1, 9):
        predictor.model.train()
        for x, y in loader:
            optimizer.zero_grad(set_to_none=True)
            logits = predictor.model(x.to(predictor.device))
            loss = torch.nn.functional.cross_entropy(logits, y.to(predictor.device))
            if not torch.isfinite(loss):
                raise ValueError("Non-finite training loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(predictor.model.parameters(), 5)
            optimizer.step()
        predictor.model.eval()
        scores = validation_scores(predictor, val, original)
        history.append(scores)
        if eligible(scores, baseline) and scores["mixed"] > best:
            best, selected = scores["mixed"], epoch
            torch.save(predictor.model.state_dict(), output / "best.pt")
        print(f"Epoch {epoch}: {scores}; selected={selected}", flush=True)

    write_json(output / "config.json", {**predictor.config, "seed": 63,
               "weights_origin": f"refinement of {first['candidate_sha256']}; selected epoch {selected}",
               "learning_rate": .00005, "max_epochs": 8,
               "augmentation": "six additional mixtures per training chord, random gain -21 to -9 dB",
               "class_weighting": "sample mixed condition twice as often as each other condition"})
    shutil.copyfile(parent / "rejection.json", output / "rejection.json")
    write_json(output / "selection.json", dict(parent_sha256=first["candidate_sha256"],
               selected_sha256=file_sha256(output / "best.pt"), selected_epoch=selected, seed=63,
               extra_train_snr_db=EXTRA_SNRS, train_counts=dict(counts), baseline=baseline, history=history))
    # This is a repeat benchmark after diagnosis, not an independent second test set.
    write_json(output / "after.json", evaluate(Predictor(output), examples("test", fans)))
    print("Saved", output, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ML_ROOT / "artifacts/fan-pilot-02")
    with threadpool_limits(limits=2):
        run(parser.parse_args().output)
