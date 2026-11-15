import numpy as np
from src.features.baseline import aggregate_features
from src.features.spectral import log_mel
from src.evaluation.metrics import classification_metrics


def test_features_are_finite_on_silence_and_have_fixed_dimension():
    quiet = aggregate_features(np.zeros(44100, dtype=np.float32), 22050)
    tone = aggregate_features(
        (0.1 * np.sin(2 * np.pi * 440 * np.arange(66150) / 22050)).astype(np.float32),
        22050,
    )
    assert quiet.shape == tone.shape and quiet.ndim == 1
    assert np.isfinite(quiet).all() and np.isfinite(tone).all()
    assert not np.allclose(quiet, tone)


def test_mel_window_shapes_and_fixed_band_count():
    assert log_mel(np.zeros(44100, dtype=np.float32), 22050).shape == (128, 87)
    assert log_mel(np.zeros(66150, dtype=np.float32), 22050).shape == (128, 130)


def test_noise_metrics_distinguish_false_accept_and_false_reject():
    m = classification_metrics([0, 0, 1, 1], [0, 1, 0, 1], ["A", "Noise"])
    assert m["accuracy"] == 0.5 and m["noise_recall"] == 0.5
    assert m["noise_support"] == 2 and m["chords_predicted_as_noise_rate"] == 0.5
