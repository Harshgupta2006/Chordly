"""Fixed-reference Log-Mel features; any standardization is fitted on train only."""

from dataclasses import asdict, dataclass
import librosa
import numpy as np


@dataclass(frozen=True)
class MelConfig:
    n_fft: int = 2048
    hop_length: int = 512
    n_mels: int = 128
    floor_db: float = -100.0
    ceiling_db: float = 30.0

    def to_dict(self):
        return asdict(self)


def log_mel(audio: np.ndarray, sr: int, config: MelConfig = MelConfig()) -> np.ndarray:
    power = librosa.feature.melspectrogram(
        y=audio,
        sr=sr,
        n_fft=config.n_fft,
        hop_length=config.hop_length,
        n_mels=config.n_mels,
        power=2.0,
    )
    # ref=1, top_db=None: every plot and recording uses the same absolute scale.
    db = librosa.power_to_db(power, ref=1.0, top_db=None)
    return np.clip(db, config.floor_db, config.ceiling_db).astype(np.float32)
