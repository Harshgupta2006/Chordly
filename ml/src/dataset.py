"""Pinned, explicit file inventory; decode recordings with SoundFile, not datasets.Audio."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ID = "rodriler/isolated-guitar-chords"
REVISION = "07371b25b9cdd830638c4ffd5ed8b8a150d7f696"
INVENTORY = ML_ROOT / "data" / "remote_inventory.json"


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )


def remote_inventory(refresh: bool = False) -> dict:
    if refresh or not INVENTORY.exists():
        from dataclasses import asdict
        from huggingface_hub import HfApi

        info = HfApi().dataset_info(REPO_ID, revision=REVISION, files_metadata=True)
        write_json(
            INVENTORY,
            {
                "repo_id": REPO_ID,
                "revision": info.sha,
                "card": info.card_data.to_dict(),
                "files": [
                    {
                        "path": s.rfilename,
                        "size": s.size,
                        "blob_id": s.blob_id,
                        "lfs": asdict(s.lfs) if s.lfs else None,
                    }
                    for s in info.siblings
                ],
            },
        )
    result = json.loads(INVENTORY.read_text(encoding="utf-8"))
    if result["revision"] != REVISION or result["repo_id"] != REPO_ID:
        raise ValueError("Inventory does not match the pinned dataset revision")
    return result


def snapshot_root() -> Path:
    from huggingface_hub.constants import HF_HUB_CACHE

    return (
        Path(HF_HUB_CACHE)
        / ("datasets--" + REPO_ID.replace("/", "--"))
        / "snapshots"
        / REVISION
    )


def audio_entries(inventory: dict | None = None) -> list[dict]:
    inventory = inventory if inventory is not None else remote_inventory()
    result = []
    for item in inventory["files"]:
        p = Path(item["path"])
        if p.suffix.lower() not in {".wav", ".mp3"}:
            continue
        if (
            len(p.parts) != 4
            or p.parts[0] != "data"
            or p.parts[1] not in {"Train", "Test"}
        ):
            raise ValueError(f"Unexpected audio layout: {p}")
        result.append(
            {
                **item,
                "split": p.parts[1].lower(),
                "label": p.parts[2],
                "local_path": str(snapshot_root() / p),
            }
        )
    return sorted(result, key=lambda row: row["path"])


def file_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_download(entry: dict) -> None:
    p = Path(entry["local_path"])
    if not p.is_file():
        raise FileNotFoundError(entry["path"])
    if p.stat().st_size != entry["size"]:
        raise ValueError(f"Size mismatch: {entry['path']}")
    lfs = entry.get("lfs")
    if lfs and file_sha256(p) != lfs["sha256"]:
        raise ValueError(f"SHA256 mismatch: {entry['path']}")
