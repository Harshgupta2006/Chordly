"""One class-independent waveform transform shared by training and inference.

No per-recording peak normalization: it would amplify quiet Noise into a loud
signal. Fixed full-scale units and a fixed activity threshold retain that cue.
"""

from dataclasses import asdict, dataclass
from fractions import Fraction
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


class InvalidAudio(ValueError):
    """An audio input is empty, non-finite, undecodable, or outside limits."""


@dataclass(frozen=True)
class AudioConfig:
    sample_rate: int = 22050
    duration: float = 2.0
    activity_threshold: float = 0.003
    relative_activity_threshold: float = 0.1
    frame_ms: float = 20.0
    preroll_ms: float = 40.0
    max_input_seconds: float = 90.0

    def __post_init__(self):
        if not 8000 <= self.sample_rate <= 96000 or not 0.25 <= self.duration <= 5:
            raise ValueError("Invalid target sample rate or duration")
        if (
            not 0 < self.activity_threshold < 1
            or not 0 <= self.relative_activity_threshold <= 1
            or self.frame_ms <= 0
            or self.preroll_ms < 0
        ):
            raise ValueError("Invalid activity detection settings")

    def to_dict(self):
        return asdict(self)


def validate_samples(audio, sr: int, max_seconds: float = 90.0) -> np.ndarray:
    y = np.asarray(audio, dtype=np.float32)
    if not 8000 <= sr <= 192000 or y.ndim not in (1, 2) or y.size == 0:
        raise InvalidAudio("Expected nonempty audio at 8–192 kHz")
    if y.ndim == 2:
        if y.shape[1] > 8:
            raise InvalidAudio(
                "Expected samples-by-channels audio with at most 8 channels"
            )
        y = y.mean(axis=1)
    if not np.isfinite(y).all() or len(y) / sr > max_seconds:
        raise InvalidAudio("Non-finite samples or audio exceeds duration limit")
    if np.max(np.abs(y)) > 1.01:
        raise InvalidAudio("Expected floating-point audio in full-scale [-1, 1] units")
    return y


def load_audio(path_or_stream, max_seconds: float = 90.0):
    try:
        with sf.SoundFile(path_or_stream) as source:
            sr = source.samplerate
            if (
                source.frames <= 0
                or source.frames / sr > max_seconds
                or source.channels > 8
            ):
                raise InvalidAudio("Empty recording or audio exceeds input limits")
            y = source.read(dtype="float32", always_2d=True)
    except (sf.LibsndfileError, RuntimeError, OSError) as exc:
        raise InvalidAudio(f"Cannot decode audio: {exc}") from exc
    return validate_samples(y, sr, max_seconds), sr


def resample(audio: np.ndarray, original_sr: int, target_sr: int) -> np.ndarray:
    if original_sr == target_sr:
        return audio.astype(np.float32, copy=False)
    ratio = Fraction(target_sr, original_sr)
    return resample_poly(audio, ratio.numerator, ratio.denominator).astype(np.float32)


def activity_profile(audio: np.ndarray, sr: int, config: AudioConfig):
    width = max(1, round(sr * config.frame_ms / 1000))
    padded = np.pad(audio, (0, (-len(audio)) % width))
    rms = np.sqrt(np.mean(padded.reshape(-1, width).astype(np.float64) ** 2, axis=1))
    # An absolute floor protects quiet Noise; a relative gate avoids triggering
    # on tiny pre-strum handling sounds. Neither rescales the waveform.
    threshold = max(
        config.activity_threshold, float(rms.max()) * config.relative_activity_threshold
    )
    active = np.flatnonzero(rms >= threshold)
    return (
        rms,
        (int(active[0]) * width / sr if len(active) else None),
        (min(len(audio), (int(active[-1]) + 1) * width) / sr if len(active) else None),
    )


def prepare_audio(audio, sr: int, config: AudioConfig) -> np.ndarray:
    y = validate_samples(audio, sr, config.max_input_seconds)
    y = resample(y, sr, config.sample_rate)
    _, onset, _ = activity_profile(y, config.sample_rate, config)
    start = (
        max(0, round((onset - config.preroll_ms / 1000) * config.sample_rate))
        if onset is not None
        else 0
    )
    length = round(config.duration * config.sample_rate)
    y = y[start : start + length]
    return np.pad(y, (0, max(0, length - len(y)))).astype(np.float32)


def prepare_file(path_or_stream, config: AudioConfig):
    y, sr = load_audio(path_or_stream, config.max_input_seconds)
    return prepare_audio(y, sr, config)
