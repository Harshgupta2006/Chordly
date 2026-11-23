"""Cache a fixed sample of Klangio's real phone takes for local evaluation."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / "data/klangio-holdout"
REPO = "Klangio/guitar-strumming-transcription"
REVISION = "929e403f3256b055c1eea27064ae39f36905359e"
FOLDER = "dataset/klangio-gst-mm-2025"
TAKES = [group + offset for group in (1000, 2000, 4000) for offset in (1, 6, 11, 16, 21, 28)]


def verified(data, blob):
    git_header = f"blob {len(data)}\0".encode()
    return hashlib.sha1(git_header + data).hexdigest() == blob


def main():
    with urlopen(f"https://api.github.com/repos/{REPO}/git/trees/{REVISION}?recursive=1", timeout=60) as response:
        tree = json.load(response)
    assert tree["sha"] == REVISION and not tree["truncated"]
    blobs = {row["path"]: row["sha"] for row in tree["tree"]}
    ROOT.mkdir(exist_ok=True, parents=True)
    files = [f"recording_{take}{ext}" for take in TAKES for ext in (".strums", "_phone.wav")]

    def fetch(name):
        path = ROOT / name
        key = f"{FOLDER}/{name}"
        if path.exists() and verified(path.read_bytes(), blobs[key]):
            return
        with urlopen(f"https://raw.githubusercontent.com/{REPO}/{REVISION}/{key}", timeout=90) as response:
            data = response.read()
        if not verified(data, blobs[key]):
            raise ValueError(f"Git blob mismatch in {name}")
        temp = path.with_suffix(path.suffix + ".part")
        temp.write_bytes(data)
        temp.replace(path)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(fetch, files))
    (ROOT / "blobs.json").write_text(json.dumps({k: blobs[f"{FOLDER}/{k}"] for k in files}, indent=2))
    print(f"Verified {len(files)} files from {REVISION}", flush=True)


if __name__ == "__main__":
    main()
