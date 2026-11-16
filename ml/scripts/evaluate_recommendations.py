"""Chronological evaluation of the actual browser ranker using local history fixtures."""

import argparse
import json
from pathlib import Path
import subprocess

import numpy as np
import pandas as pd
from sklearn.metrics import ndcg_score

ROOT = Path(__file__).resolve().parents[2]


def evaluate(exports, k=5):
    requests, targets = [], []
    for exported in exports:
        profile = exported.get("profile", {})
        frame = pd.DataFrame(profile.get("history", []))
        if frame.empty or not {"songId", "practicedAt"}.issubset(frame.columns):
            continue
        frame["time"] = pd.to_datetime(frame["practicedAt"], utc=True, errors="coerce")
        frame = frame.dropna(subset=["time"]).sort_values("time")
        if len(frame) < 5:
            continue
        split = int(len(frame) * .8)
        cutoff = frame.iloc[split]["time"]
        before, after = frame[frame["time"] < cutoff], frame[frame["time"] >= cutoff]
        if before.empty or after.empty:
            continue
        # Current favourites, dismissals and genre preferences have no historical
        # timestamps. Exclude these signals from the chronological comparison.
        preferences = {"genres": [], "maxDifficulty": profile.get("preferences", {}).get("maxDifficulty", 3), "goal": "play"}
        history = before[["songId", "practicedAt"]].to_dict("records")
        requests.append({
            "profile": {"version": 1, "onboarded": True, "preferences": preferences, "history": history, "dismissedSongIds": []},
            "knownChords": exported.get("practiceList", {}).get("learnedChords", []),
            "favorites": [], "now": int(cutoff.timestamp() * 1000),
        })
        targets.append(set(after["songId"].astype(int)))
    report = {
        "status": "insufficient_history", "profiles_received": len(exports), "profiles_evaluated": 0,
        "method": "Chronological 80/20 split with at least five practice entries; model ranking before artist diversity.",
        "assumptions": ["Current known chords and maximum difficulty are fixed across each split.",
                        "Untimestamped favourites, dismissals and genre preferences are excluded."],
        "k": k, "metrics": None,
    }
    if not requests:
        return report
    process = subprocess.run(["node", str(ROOT / "frontend/scripts/rank-recommendations.mjs")],
                             input=json.dumps(requests), text=True, capture_output=True, check=True, cwd=ROOT)
    results = json.loads(process.stdout)
    metrics = {"personalized": [], "baseline": []}
    for result, target in zip(results, targets):
        eligible = set(result["personalized"])
        relevant = target & eligible
        if not relevant:
            continue
        report["profiles_evaluated"] += 1
        for model in metrics:
            ordered = result[model]
            top = ordered[:k]
            hits = len(set(top) & relevant)
            relevance = np.array([[int(song in relevant) for song in ordered]])
            predictions = np.arange(len(ordered), 0, -1)[None, :]
            ndcg = float(ndcg_score(relevance, predictions, k=k)) if len(ordered) > 1 else float(hits > 0)
            metrics[model].append([hits / min(k, len(ordered)), hits / len(relevant), ndcg])
    if report["profiles_evaluated"]:
        report["status"] = "evaluated"
        report["metrics"] = {model: dict(zip([f"precision@{k}", f"recall@{k}", f"ndcg@{k}"], np.mean(values, axis=0).round(6).tolist())) for model, values in metrics.items()}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("exports", type=Path, nargs="*", help="Local versioned practice-history fixtures")
    parser.add_argument("--k", type=int, default=5, choices=range(1, 21))
    args = parser.parse_args()
    exports = [json.loads(path.read_text(encoding="utf-8")) for path in args.exports]
    print(json.dumps(evaluate(exports, args.k), indent=2))


if __name__ == "__main__":
    main()
