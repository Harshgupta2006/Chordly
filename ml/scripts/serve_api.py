"""Serve local ML on loopback with an isolated catalog database; no production access."""

import argparse
import os
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8100)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    if not (root / "ml/artifacts/cnn/rejection.json").exists():
        raise RuntimeError(
            "Train and validate the local CNN first; checkpoint/threshold metadata is missing"
        )
    os.environ["ENVIRONMENT"] = "development"
    os.environ["ENABLE_AUDIO_ML"] = "true"
    os.environ["DATABASE_URL_READONLY"] = (
        "sqlite:///" + (root / "ml/data/local_app.db").as_posix()
    )
    os.environ["ALLOWED_ORIGINS"] = (
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100"
    )
    sys.path.insert(0, str(root / "backend"))
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
