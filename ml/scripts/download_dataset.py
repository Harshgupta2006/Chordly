"""Resume missing pinned dataset files without replacing valid cached audio."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.dataset import (
    REPO_ID,
    REVISION,
    audio_entries,
    remote_inventory,
    verify_download,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--refresh-inventory", action="store_true")
    args = parser.parse_args()
    from huggingface_hub import hf_hub_download

    inventory = remote_inventory(args.refresh_inventory)
    pending = []
    for entry in audio_entries(inventory):
        # Existing files are verified, never silently overwritten on corruption.
        if Path(entry["local_path"]).exists():
            verify_download(entry)
        else:
            pending.append(entry)
    print(
        f"Pinned revision {REVISION}; preserved {len(audio_entries(inventory)) - len(pending)} files; missing {len(pending)}",
        flush=True,
    )

    def download(entry):
        hf_hub_download(REPO_ID, entry["path"], repo_type="dataset", revision=REVISION)
        verify_download(entry)
        return entry["path"]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(download, entry) for entry in pending]
        for i, future in enumerate(as_completed(futures), 1):
            print(f"[{i}/{len(pending)}] verified {future.result()}", flush=True)
    print("All remote audio files present and verified.")


if __name__ == "__main__":
    main()
