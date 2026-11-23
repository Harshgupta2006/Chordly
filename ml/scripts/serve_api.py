"""Serve local ML on loopback with an isolated catalog database; no production access."""

import argparse
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8100)
    parser.add_argument("--artifact-dir", type=Path, default=root / "ml/artifacts/cnn",
                        help="Local CNN checkpoint directory to serve")
    parser.add_argument(
        "--frontend-origin", action="append", default=[],
        help="Additional loopback frontend origin, for example http://127.0.0.1:3105",
    )
    args = parser.parse_args()
    for origin in args.frontend_origin:
        try:
            url = urlsplit(origin)
            url.port
        except ValueError:
            parser.error("--frontend-origin has an invalid host or port")
        if (url.scheme not in {"http", "https"} or url.hostname not in {"localhost", "127.0.0.1"}
                or url.username or url.password or url.path or url.query or url.fragment):
            parser.error("--frontend-origin must be an HTTP(S) localhost/127.0.0.1 origin without a path or credentials")
    artifact_dir = args.artifact_dir.resolve()
    for filename in ("best.pt", "config.json", "rejection.json"):
        if not (artifact_dir / filename).is_file():
            parser.error(f"Checkpoint is missing {filename} in {artifact_dir}")
    os.environ["CHORDLY_LOCAL_AUDIO_ARTIFACT_DIR"] = str(artifact_dir)
    os.environ["ENVIRONMENT"] = "development"
    os.environ["ENABLE_AUDIO_ML"] = "true"
    os.environ["DATABASE_URL_READONLY"] = (
        "sqlite:///" + (root / "ml/data/local_app.db").as_posix()
    )
    os.environ["ALLOWED_ORIGINS"] = ",".join([
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:3100", "http://127.0.0.1:3100", *args.frontend_origin,
    ])
    sys.path.insert(0, str(root / "backend"))
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
