import io
import numpy as np
import pytest
import soundfile as sf
from src.preprocessing.audio import AudioConfig, InvalidAudio, load_audio, prepare_audio
from src.features.spectral import log_mel


def test_resample_mono_and_fixed_length():
    sr = 44100
    y = np.tile(np.sin(2 * np.pi * 440 * np.arange(sr) / sr)[:, None] * 0.1, (1, 2))
    result = prepare_audio(y, sr, AudioConfig(duration=2))
    assert result.shape == (44100,)
    assert np.isfinite(result).all()
    assert abs(np.max(result) - 0.1) < 0.005


def test_silent_noise_stays_silent_and_padded():
    y = prepare_audio(np.zeros(2205), 22050, AudioConfig())
    assert y.shape == (44100,)
    assert np.count_nonzero(y) == 0
    assert np.isfinite(log_mel(y, 22050)).all()


def test_activity_crop_preserves_quiet_noise_amplitude():
    quiet = np.ones(22050, dtype=np.float32) * 0.0001
    result = prepare_audio(quiet, 22050, AudioConfig())
    assert result.max() == quiet.max()
    y = np.r_[np.zeros(22050), np.ones(22050) * 0.1]
    result = prepare_audio(y, 22050, AudioConfig())
    assert np.argmax(result > 0.05) == 882  # 40 ms pre-roll retained


@pytest.mark.parametrize(
    "y,sr",
    [
        (np.array([]), 22050),
        (np.array([np.nan]), 22050),
        (np.array([np.inf]), 22050),
        (np.zeros(100), 0),
        (np.ones(100) * 3, 22050),
    ],
)
def test_reject_invalid_samples(y, sr):
    with pytest.raises(InvalidAudio):
        prepare_audio(y, sr, AudioConfig())


def test_wav_decode_stereo_and_malformed():
    stream = io.BytesIO()
    sf.write(stream, np.ones((1000, 2)) * 0.1, 22050, format="WAV", subtype="PCM_16")
    stream.seek(0)
    y, sr = load_audio(stream)
    assert y.shape == (1000,) and sr == 22050
    with pytest.raises(InvalidAudio):
        load_audio(io.BytesIO(b"not a wav"))


def test_absolute_mel_scale_preserves_gain():
    y = (0.1 * np.sin(2 * np.pi * 440 * np.arange(44100) / 22050)).astype(np.float32)
    loud, quiet = log_mel(y, 22050), log_mel(y * 0.1, 22050)
    assert loud.shape == quiet.shape == (128, 87)
    mask = (quiet > -70) & (loud < 25)
    assert np.median((loud - quiet)[mask]) == pytest.approx(20, abs=0.02)
