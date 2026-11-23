"""Cache public CC0 Freesound previews and their provenance for the local pilot."""

import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.dataset import ML_ROOT, file_sha256, write_json

DATA = ML_ROOT / "data/public-tunerobust"
# Assign whole recordings and uploaders before looking at model predictions.
FANS = [
    ("train", "seventhsamurai", 327449),
    ("train", "deleted_user_2104797", 330270),
    ("train", "FOSSarts", 740546),
    ("train", "AlbertCoetser", 492149),
    ("validation", "omardesigner", 651321),
    ("validation", "sandhill0818", 862559),
    ("test", "Valerie-Vivegnis", 803447),
    ("test", "JW_Audio", 806681),
    ("test", "itinerantmonk108", 554014),
]


def fetch(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": "Chordly local audio research/1.0"}), timeout=60) as response:
                return response.read()
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def cache_sources(sources, manifest):
    import soundfile as sf
    folder = DATA / "fans"
    folder.mkdir(parents=True, exist_ok=True)
    def download(source):
        split, creator, sound_id = source
        page = f"https://freesound.org/people/{creator}/sounds/{sound_id}/"
        html = fetch(page).decode()
        if "creativecommons.org/publicdomain/zero/" not in html:
            raise ValueError(f"Cannot verify CC0 for {sound_id}")
        pattern = rf"https://cdn\.freesound\.org/previews/\d+/{sound_id}_\d+-hq\.mp3"
        preview = re.search(pattern, html)
        if not preview:
            raise ValueError(f"Missing public preview for {sound_id}")
        dest = folder / f"{sound_id}.mp3"
        if not dest.exists():
            partial = dest.with_suffix(".part")
            partial.write_bytes(fetch(preview[0]))
            sf.info(partial)
            partial.replace(dest)
        print(f"{split}: {sound_id}", flush=True)
        return dict(split=split, creator=creator, id=sound_id, source=page,
                    preview=preview[0], license="CC0-1.0", sha256=file_sha256(dest))
    with ThreadPoolExecutor(max_workers=3) as pool:
        rows = list(pool.map(download, sources))
    write_json(DATA / manifest, rows)
    return rows


if __name__ == "__main__":
    cache_sources(FANS, "fans.json")
