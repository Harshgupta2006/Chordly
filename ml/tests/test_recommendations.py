"""Recommendation feature preparation and chronological evaluation regressions."""

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "ml/scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load_script("build_recommendation_features")
evaluator = load_script("evaluate_recommendations")


def exported_profile():
    return {
        "version": 1,
        "practiceList": {"favorites": [2], "learnedChords": ["C", "G", "D", "Em"]},
        "profile": {
            "version": 1,
            "preferences": {"genres": ["rock"], "maxDifficulty": 3, "goal": "learn"},
            "dismissedSongIds": [2],
            "history": [
                {"songId": song_id, "practicedAt": f"2026-10-{index + 1:02d}T10:00:00Z"}
                for index, song_id in enumerate([1, 2, 1, 3, 2])
            ],
        },
    }


def test_feature_build_is_deterministic_and_normalized():
    songs = json.loads((ROOT / "frontend/data/songs.json").read_text(encoding="utf-8"))
    artifact = builder.build_features(songs)
    assert artifact == builder.build_features(songs)
    vectors = np.asarray(list(artifact["vectors"].values()))
    assert np.isfinite(vectors).all()
    np.testing.assert_allclose(np.linalg.norm(vectors, axis=1), 1, atol=1e-6)
    assert vectors.shape[1] == len(artifact["feature_names"])
    committed = json.loads((ROOT / "frontend/data/recommendationFeatures.json").read_text())
    assert committed["catalogue_sha256"] == artifact["catalogue_sha256"]


def test_empty_history_has_no_fabricated_metrics():
    report = evaluator.evaluate([])
    assert report["status"] == "insufficient_history"
    assert report["metrics"] is None


def test_chronological_split_excludes_future_and_untimestamped_signals(monkeypatch):
    def run(command, input, **kwargs):
        request = json.loads(input)[0]
        assert request["favorites"] == []
        assert request["profile"]["dismissedSongIds"] == []
        assert request["profile"]["preferences"]["genres"] == []
        assert len(request["profile"]["history"]) == 4
        assert all(entry["practicedAt"] < "2026-10-05" for entry in request["profile"]["history"])
        return SimpleNamespace(stdout=json.dumps([{"personalized": [2, 1, 3], "baseline": [1, 3, 2]}]))

    monkeypatch.setattr(evaluator.subprocess, "run", run)
    report = evaluator.evaluate([exported_profile()], k=2)
    assert report["status"] == "evaluated"
    assert report["metrics"]["personalized"]["recall@2"] == 1
    assert report["metrics"]["baseline"]["recall@2"] == 0


def test_real_typescript_ranker_runs_for_offline_evaluation():
    report = evaluator.evaluate([exported_profile()])
    assert report["status"] == "evaluated"
    for model in report["metrics"].values():
        assert all(0 <= score <= 1 for score in model.values())
