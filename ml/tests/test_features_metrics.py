import numpy as np
from src.features.baseline import aggregate_features
from src.features.spectral import log_mel
from src.evaluation.metrics import classification_metrics, recognition_metrics


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


def test_recognition_metrics_count_noise_accepted_as_a_chord():
    result = recognition_metrics([
        {"actual": "Noise", "predicted_class": "F", "status": "ok", "chord": "F"},
        {"actual": "Noise", "predicted_class": "F", "status": "silence", "chord": None},
        {"actual": "A", "predicted_class": "A", "status": "ok", "chord": "A"},
        {"actual": "A", "predicted_class": "F", "status": "uncertain", "chord": None},
    ])
    assert result["noise_false_acceptances"] == 1
    assert result["noise_false_acceptance_rate"] == 0.5
    assert result["chord_acceptance_rate"] == 0.5
    assert result["accepted_predictions"] == 2
    assert result["accepted_prediction_accuracy"] == 0.5
    assert all(value is None or value == 0 for value in recognition_metrics([]).values())
