"""Local GuitarSet / household fan adaptation of Chordly's frozen PyTorch checkpoint."""

import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import sys
import zipfile

import numpy as np
import soundfile as sf
from threadpoolctl import threadpool_limits

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.training.cnn import seed_all
from src.dataset import ML_ROOT, file_sha256, write_json
from src.evaluation.metrics import recognition_metrics
from src.inference.predictor import Predictor
from src.preprocessing.audio import resample
from fetch_finetune_fans import DATA, FANS
import torch
from torch.utils.data import DataLoader, TensorDataset


SPLITS = {"train": ("00", "01", "02"), "validation": ("03",), "test": ("04", "05")}
CHECKSUMS = {"annotation.zip": "b39b78e63d3446f2e54ddb7a54df9b10",
             "audio_mono-mic.zip": "275966d6610ac34999b58426beb119c3"}
BASE = ML_ROOT / "artifacts/cnn"
SR = 22050


def chord_symbol(value):
    match = re.fullmatch(r"([A-G][b#]?):(maj|min)(?:/(?:1|3|b3|5))?", value)
    if not match:
        return None
    flats = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
    root, quality = match.groups()
    return flats.get(root, root) + ("m" if quality == "min" else "")


def rms(y):
    return float(np.sqrt(np.mean(y ** 2, dtype=np.float64)))


def mix(chord, fan, snr_db):
    level = rms(fan)
    if level == 0:
        raise ValueError("Silent fan crop")
    combined = chord + fan * (rms(chord) / level * 10 ** (-snr_db / 20))
    return combined / max(1., float(np.max(np.abs(combined))))


def verified_sources():
    for name, md5 in CHECKSUMS.items():
        with (DATA / name).open("rb") as stream:
            if hashlib.file_digest(stream, "md5").hexdigest() != md5:
                raise ValueError(f"GuitarSet archive differs from Zenodo: {name}")
    fans = json.loads((DATA / "fans.json").read_text())
    if [(r["split"], r["creator"], r["id"]) for r in fans] != FANS:
        raise ValueError("Fan source assignments differ from the experiment")
    for row in fans:
        if file_sha256(DATA / "fans" / f"{row['id']}.mp3") != row["sha256"]:
            raise ValueError(f"Fan preview changed: {row['id']}")
    return fans


def examples(split, fans, training_snrs=()):
    if training_snrs and split != "train":
        raise ValueError("Extra fan mixtures belong only in the training split")
    rng = np.random.default_rng({"train": 581, "validation": 582, "test": 583}[split])
    recordings = {}
    for row in fans:
        if row["split"] != split:
            continue
        key = row["id"]
        raw, rate = sf.read(DATA / "fans" / f"{key}.mp3", dtype="float32", always_2d=True)
        audio = resample(raw.mean(axis=1), rate, SR)
        # Avoid switch-on, switch-off and file boundary artefacts.
        margin = min(int(len(audio) * .15), (len(audio) - 3 * SR) // 2)
        if margin < 0:
            raise ValueError(f"Fan {key} is shorter than three seconds")
        audio = audio[margin:len(audio)-margin]
        audio /= max(1., float(np.abs(audio).max()))
        recordings[key] = audio
        count = min(16, len(audio) // (3 * SR))
        for start in np.linspace(0, len(audio) - 3 * SR, count, dtype=int):
            yield dict(condition="fan", actual="Noise", fan=key, fan_sample=int(start)), audio[start:start+3*SR]

    with zipfile.ZipFile(DATA / "annotation.zip") as jams, zipfile.ZipFile(DATA / "audio_mono-mic.zip") as waves:
        wavs = {Path(p).name: p for p in waves.namelist() if not Path(p).name.startswith(".")}
        for name in sorted(jams.namelist()):
            stem = Path(name).stem
            if not stem.endswith("_comp") or stem[:2] not in SPLITS[split]:
                continue
            annotations = json.loads(jams.read(name))["annotations"]
            performed, = [a for a in annotations if a["namespace"] == "chord"
                          and "chord transcription" in a["annotation_metadata"]["data_source"]]
            raw, rate = sf.read(io.BytesIO(waves.read(wavs[stem + "_mic.wav"])), dtype="float32")
            audio = resample(raw, rate, SR)
            audio /= max(1., float(np.abs(audio).max()))
            for event in performed["data"]:
                label = chord_symbol(event["value"])
                if not label or event["duration"] < 1.0:
                    continue
                start = round((event["time"] + .05) * SR)
                length = round(min(3., event["duration"] - .1) * SR)
                y = audio[start:start+length]
                if len(y) != length or rms(y) < .003:
                    continue
                meta = dict(actual=label, performance=stem, time=event["time"], duration=len(y)/SR)
                yield dict(meta, condition="clean"), y
                quiet = y * 10 ** (-15/20)
                yield dict(meta, condition="quiet"), quiet
                key = int(rng.choice(list(recordings)))
                noise = recordings[key]
                offset = int(rng.integers(0, len(noise)-length+1))
                snr = int(rng.choice([3, 9, 15]))
                yield dict(meta, condition="mixed", fan=key, fan_sample=offset, snr_db=snr), mix(
                    quiet, noise[offset:offset+length], snr)
                for level in training_snrs:
                    source = int(rng.choice(list(recordings)))
                    new_fan = recordings[source]
                    pos = int(rng.integers(0, len(new_fan)-length+1))
                    gain_db = float(rng.uniform(-21, -9))
                    yield dict(meta, condition="mixed", fan=source, fan_sample=pos, snr_db=level,
                               gain_db=gain_db), mix(y * 10 ** (gain_db / 20), new_fan[pos:pos+length], level)


def evaluate(predictor, clips):
    rows = []
    for meta, y in clips:
        result = predictor.predict(y, SR)
        rows.append({**meta, **{k: result[k] for k in ("chord", "status", "predicted_class", "model_score")}})
    summary = {}
    for condition in ("fan", "clean", "quiet", "mixed"):
        group = [row for row in rows if row["condition"] == condition]
        if not group:
            raise ValueError(f"No {condition} examples")
        summary[condition] = dict(recognition_metrics(group), total=len(group),
                                  correct_chord=sum(r["chord"] == r["actual"] for r in group))
    return {"summary": summary, "rows": rows}


def tensors(predictor, split, fans, training_snrs=()):
    features, labels, kinds = [], [], []
    for row, y in examples(split, fans, training_snrs):
        features.append(predictor.features(y, SR))
        labels.append(predictor.names.index(row["actual"]))
        kinds.append(row["condition"])
    with np.load(ML_ROOT / f"data/processed/{split}_3s.npz") as orig:
        if orig["paths"].tolist() != predictor.config["split_manifest"]["parts"][split]:
            raise ValueError("Original rehearsal split does not match the parent checkpoint")
        x = np.concatenate([np.stack(features), (orig["mel"] - predictor.mean) / predictor.std])
        labels.extend(orig["labels"].tolist())
        kinds.extend(["original"] * len(orig["labels"]))
    return TensorDataset(torch.from_numpy(x[:, None]), torch.tensor(labels)), np.array(kinds)


def run(output):
    fans = verified_sources()
    seed_all(42)
    predictor = Predictor(BASE)
    output.mkdir(parents=True, exist_ok=False)
    parent_hash = file_sha256(BASE / "best.pt")
    test_clips = list(examples("test", fans))
    write_json(output / "before.json", evaluate(predictor, test_clips))
    train, train_kinds = tensors(predictor, "train", fans)
    val, val_kinds = tensors(predictor, "validation", fans)
    counts = Counter(train_kinds)
    print(f"{predictor.device}: train {counts}; validation {Counter(val_kinds)}", flush=True)
    # Give each of the four new conditions and original rehearsal data equal sampling weight.
    sampler = torch.utils.data.WeightedRandomSampler(
        [1 / counts[k] for k in train_kinds], len(train), replacement=True)
    loader = DataLoader(train, batch_size=32, sampler=sampler)
    validation = DataLoader(val, batch_size=64)
    optimizer = torch.optim.AdamW(predictor.model.parameters(), lr=0.0001)
    best = -1
    history = []
    for epoch in range(1, 13):
        predictor.model.train()
        for x, y in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = torch.nn.functional.cross_entropy(predictor.model(x.to(predictor.device)), y.to(predictor.device))
            if not torch.isfinite(loss):
                raise RuntimeError("Non-finite fine-tuning loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(predictor.model.parameters(), 5)
            optimizer.step()
        predictor.model.eval()
        with torch.inference_mode():
            pred = torch.cat([predictor.model(x.to(predictor.device)).argmax(1).cpu() for x, _ in validation]).numpy()
        correct = pred == val.tensors[1].numpy()
        by_kind = {k: float(correct[val_kinds == k].mean()) for k in sorted(set(val_kinds))}
        score = float(np.mean(list(by_kind.values())))
        history.append(dict(epoch=epoch, validation=by_kind, mean=score))
        if score > best:
            best, best_epoch = score, epoch
            torch.save(predictor.model.state_dict(), output / "best.pt")
        print(f"Epoch {epoch}: balanced validation top-1 {score:.3f}", flush=True)
    write_json(output / "config.json", {**predictor.config, "weights_origin": f"fine-tuned from {parent_hash}",
               "learning_rate": .0001, "batch_size": 32, "max_epochs": 12,
               "augmentation": "GuitarSet clean, -15 dB, quiet with fan at 3/9/15 dB SNR",
               "class_weighting": "equal sampling by condition", "device": str(predictor.device)})
    shutil.copyfile(BASE / "rejection.json", output / "rejection.json")
    candidate = Predictor(output)
    write_json(output / "after.json", evaluate(candidate, test_clips))
    write_json(output / "experiment.json", dict(parent_sha256=parent_hash, candidate_sha256=file_sha256(output / "best.pt"),
               guitarset_splits=SPLITS, guitarset_md5=CHECKSUMS, fans=fans, seed=42,
               torch_version=str(torch.__version__), device=str(predictor.device),
               train_counts=dict(counts), validation_counts=dict(Counter(val_kinds)),
               best_epoch=best_epoch, history=history, threshold=predictor.threshold))
    print(f"Saved local candidate and paired evaluations: {output}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ML_ROOT / "artifacts/fan-pilot-01")
    with threadpool_limits(limits=2):
        run(parser.parse_args().output)
