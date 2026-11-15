"""Export the frozen local checkpoint for CPU hosting; never trains or downloads."""

import hashlib
import json
from pathlib import Path
import shutil
import sys

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT))

import librosa
import numpy as np
import onnx
import torch
from scipy.signal import get_window
from src.inference.predictor import Predictor


def main():
    destination = ML_ROOT.parent / "frontend/audio_backend/model"
    destination.mkdir(parents=True, exist_ok=True)
    predictor = Predictor(device="cpu")
    example = torch.zeros(1, 1, predictor.mel.n_mels, 130)
    model_path = destination / "chord_cnn.onnx"
    torch.onnx.export(
        predictor.model, example, str(model_path), opset_version=17,
        input_names=["spectrogram"], output_names=["logits"],
        dynamic_axes={"spectrogram": {3: "frames"}}, dynamo=False,
    )
    onnx.checker.check_model(onnx.load(model_path))
    np.savez_compressed(
        destination / "spectral.npz",
        mel_filters=librosa.filters.mel(sr=predictor.audio.sample_rate,
            n_fft=predictor.mel.n_fft, n_mels=predictor.mel.n_mels),
        window=get_window("hann", predictor.mel.n_fft, fftbins=True),
    )
    metadata = {key: predictor.config[key] for key in
                ["architecture", "class_names", "audio", "mel", "normalization"]}
    metadata.update(threshold=predictor.threshold, supported=sorted(predictor.supported),
                    checkpoint_sha256=hashlib.sha256((predictor.root / "best.pt").read_bytes()).hexdigest(),
                    onnx_sha256=hashlib.sha256(model_path.read_bytes()).hexdigest())
    (destination / "config.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    # Bundle the exact training waveform transform; CI checks this copy stays in sync.
    shutil.copyfile(ML_ROOT / "src/preprocessing/audio.py", destination.parent / "preprocessing.py")
    print(f"Exported frozen CNN ({model_path.stat().st_size:,} bytes); checkpoint unchanged.")


if __name__ == "__main__":
    main()
