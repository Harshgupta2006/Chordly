"""Evaluate frozen Chordly checkpoints on the same real phone takes and fan crops."""

import json

import numpy as np
import soundfile as sf
from threadpoolctl import threadpool_limits

from fetch_klangio_holdout import REVISION, ROOT, TAKES, verified
from finetune_public import DATA, ML_ROOT, SR, Predictor, evaluate, file_sha256, mix, resample, rms, write_json


def chord_runs(text):
    events = []
    for line in text.splitlines():
        stamp, direction, chord = line.split()
        stamp = float(stamp)
        if direction not in ("U", "D") or (events and stamp <= events[-1][0]):
            raise ValueError(f"Unexpected strum annotation: {line}")
        root, quality = chord.split("-")
        if quality not in ("major", "minor"):
            raise ValueError(f"Unexpected chord: {chord}")
        label = {"Bb": "A#", "Eb": "D#", "Ab": "G#", "Db": "C#", "Gb": "F#"}.get(root, root)
        events.append((stamp, label + ("m" if quality == "minor" else "")))
    first, active = events[0]
    for stamp, label in events[1:]:
        if label != active:
            yield first, stamp, active
            first, active = stamp, label
    # The final strum has no annotated end. Never extrapolate past its onset.
    yield first, events[-1][0], active


def mono(path):
    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    return resample(audio.mean(axis=1), rate, SR)


def clips():
    rng = np.random.default_rng(20261123)
    fans = {}
    for item in json.loads((DATA / "fans.json").read_text()):
        if item["split"] != "test":
            continue
        fan = item["id"]
        path = DATA / "fans" / f"{fan}.mp3"
        if file_sha256(path) != item["sha256"]:
            raise ValueError(f"Fan checksum mismatch: {fan}")
        noise = mono(path)
        margin = min(int(len(noise) * .15), (len(noise) - 3 * SR) // 2)
        if margin < 0:
            raise ValueError(f"Short fan recording: {fan}")
        noise = noise[margin:len(noise) - margin]
        fans[fan] = noise
        for offset in np.linspace(0, len(noise) - 3 * SR, min(16, len(noise) // (3 * SR)), dtype=int):
            yield dict(condition="fan", fan=fan, fan_sample=int(offset), actual="Noise"), noise[offset:offset + 3*SR]

    for take in TAKES:
        path = ROOT / f"recording_{take}_phone.wav"
        guitar = mono(path)
        for start, end, label in chord_runs((ROOT / f"recording_{take}.strums").read_text()):
            if end - start < 1:
                continue
            begin = round((start + .05) * SR)
            length = round(min(3, end - start - .1) * SR)
            chord = guitar[begin:begin + length]
            if len(chord) != length:
                raise ValueError(f"Annotation outside recording {take}: {start}")
            if rms(chord) < .003:
                continue
            meta = dict(take=take, sample=begin, length=length, actual=label)
            yield dict(meta, condition="clean"), chord
            quiet = chord * 10 ** (-15/20)
            yield dict(meta, condition="quiet"), quiet
            for fan, noise in fans.items():
                offset = int(rng.integers(0, len(noise) - length + 1))
                yield dict(meta, condition="mixed", fan=fan, fan_sample=offset, snr_db=3), mix(
                    quiet, noise[offset:offset + length], 3)


def main():
    blobs = json.loads((ROOT / "blobs.json").read_text())
    for take in TAKES:
        for ext in (".strums", "_phone.wav"):
            path = ROOT / f"recording_{take}{ext}"
            if not verified(path.read_bytes(), blobs[path.name]):
                raise ValueError(f"Source file differs: {path.name}")
    output = ML_ROOT / "artifacts/klangio-holdout"
    for name in ("cnn", "fan-pilot-01", "fan-pilot-02"):
        artifact = ML_ROOT / "artifacts" / name
        predictor = Predictor(artifact)
        with threadpool_limits(limits=2):
            report = evaluate(predictor, clips())
        report.update(revision=REVISION, threshold=predictor.threshold,
                      hashes={f: file_sha256(artifact / f) for f in ("config.json", "rejection.json", "best.pt")})
        write_json(output / f"{name}.json", report)
        print(name, {k: (v["correct_chord"], v["accepted_predictions"], v["total"])
                     for k, v in report["summary"].items()}, flush=True)


if __name__ == "__main__":
    main()
