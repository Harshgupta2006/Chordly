import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from finetune_public import FANS, SPLITS, chord_symbol, examples, mix, rms
from refine_mixed import eligible
from evaluate_klangio_holdout import chord_runs


def test_phone_chord_runs_stop_at_changes_and_last_annotated_onset():
    text = "0.5 D Bb-major\n1.0 U Bb-major\n2.0 D B-minor\n4.0 U B-minor"
    assert list(chord_runs(text)) == [(0.5, 2.0, "A#"), (2.0, 4.0, "Bm")]
    with pytest.raises(ValueError, match="annotation"):
        list(chord_runs("1.0 D C-major\n0.5 U G-major"))


def test_pilot_splits_and_labels():
    players = [p for group in SPLITS.values() for p in group]
    assert len(players) == len(set(players)) == 6
    assert len({author for _, author, _ in FANS}) == len(FANS)
    for split in SPLITS:
        assert any(part == split for part, _, _ in FANS)
    assert chord_symbol("F:maj/1") == "F"
    assert chord_symbol("Db:min/5") == "C#m"
    assert all(chord_symbol(v) is None for v in ("N", "F:7/1", "D:(1,5)/1", "A:min7"))


def test_mixing_preserves_snr_and_rejects_silence():
    t = np.arange(22050) / 22050
    chord, fan = .1 * np.sin(2*np.pi*440*t), .02 * np.sin(2*np.pi*60*t)
    for snr in (3, 9, 15):
        assert 20*np.log10(rms(chord) / rms(mix(chord, fan, snr)-chord)) == pytest.approx(snr)
    with pytest.raises(ValueError):
        mix(chord, np.zeros_like(chord), 9)


def test_refinement_keeps_extra_mixtures_in_training_and_checks_validation_guardrails():
    for split in ("validation", "test"):
        with pytest.raises(ValueError, match="training split"):
            next(examples(split, [], training_snrs=(0,)))
    base = dict(clean=105, quiet=104, mixed=80, mixed_wrong=12, fan_false_accepts=0, original_correct=123)
    assert eligible({**base, "mixed": 88}, base)
    for change in ({"quiet": 102}, {"fan_false_accepts": 1}, {"mixed_wrong": 14}, {"original_correct": 121}):
        assert not eligible({**base, **change}, base)
