"""Compact waveform statistics for the traditional SVM comparison."""

import librosa
import numpy as np

BASELINE_FEATURE_CONFIG = {
    "n_fft": 4096,
    "hop_length": 512,
    "n_mels": 128,
    "n_mfcc": 20,
    "descriptors": [
        "mfcc",
        "chroma_stft",
        "spectral_contrast",
        "rms",
        "zero_crossing_rate",
        "spectral_centroid",
        "spectral_bandwidth",
        "spectral_rolloff",
    ],
    "aggregation": ["mean", "standard_deviation"],
    "output_dimension": 88,
    "power_db_reference": 1.0,
    "top_db": None,
    "scaler_fit_partition": "training recordings only",
}


def aggregate_features(y: np.ndarray, sr: int) -> np.ndarray:
    power = np.abs(librosa.stft(y, n_fft=4096, hop_length=512)) ** 2
    mel = librosa.feature.melspectrogram(S=power, sr=sr, n_mels=128)
    mfcc = librosa.feature.mfcc(
        S=librosa.power_to_db(mel, ref=1.0, top_db=None), n_mfcc=20
    )
    chroma = librosa.feature.chroma_stft(S=power, sr=sr, n_fft=4096, hop_length=512)
    descriptors = [
        mfcc,
        chroma,
        librosa.feature.spectral_contrast(S=np.sqrt(power), sr=sr),
        librosa.feature.rms(y=y),
        librosa.feature.zero_crossing_rate(y),
        librosa.feature.spectral_centroid(S=np.sqrt(power), sr=sr),
        librosa.feature.spectral_bandwidth(S=np.sqrt(power), sr=sr),
        librosa.feature.spectral_rolloff(S=np.sqrt(power), sr=sr),
    ]
    features = np.concatenate(
        [stat for d in descriptors for stat in (d.mean(axis=1), d.std(axis=1))]
    ).astype(np.float32)
    if not np.isfinite(features).all():
        raise ValueError("Non-finite baseline features")
    return features
