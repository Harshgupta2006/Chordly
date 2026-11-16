"""Prepare public content features. Personal preferences/history stay in the browser."""

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.preprocessing import MultiLabelBinarizer, OneHotEncoder, normalize

ROOT = Path(__file__).resolve().parents[2]


def build_features(songs):
    frame = pd.DataFrame(songs).sort_values("id")
    chord_encoder = MultiLabelBinarizer()
    chords = chord_encoder.fit_transform(frame["chords"])
    chord_vectors = TfidfTransformer().fit_transform(chords).toarray()
    categorical = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
    categories = categorical.fit_transform(frame[["genre", "artist", "difficulty"]])
    blocks = np.split(categories, np.cumsum([len(values) for values in categorical.categories_])[:-1], axis=1)
    vectors = normalize(np.hstack([
        chord_vectors * np.sqrt(.55), blocks[0] * np.sqrt(.25),
        blocks[1] * np.sqrt(.15), blocks[2] * np.sqrt(.05),
    ]))
    names = [f"chord:{name}" for name in chord_encoder.classes_]
    names.extend(map(str, categorical.get_feature_names_out()))
    catalogue = json.dumps(songs, sort_keys=True, separators=(",", ":")).encode()
    return {
        "version": 1,
        "catalogue_sha256": hashlib.sha256(catalogue).hexdigest(),
        "feature_names": names,
        "ranking": {"chord": .45, "content": .30, "genre": .15, "difficulty": .10, "recent_penalty": .15},
        "vectors": {str(song_id): np.round(vector, 7).tolist() for song_id, vector in zip(frame["id"], vectors)},
    }


def main():
    songs = json.loads((ROOT / "frontend/data/songs.json").read_text(encoding="utf-8"))
    artifact = build_features(songs)
    destination = ROOT / "frontend/data/recommendationFeatures.json"
    destination.write_text(json.dumps(artifact, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote catalogue features with {len(artifact['feature_names'])} dimensions.")


if __name__ == "__main__":
    main()
