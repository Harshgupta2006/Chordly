"""Execute a notebook with this exact venv, storing all output in the notebook."""

import argparse
import json
import os
from pathlib import Path
import sys

import nbformat
from nbclient import NotebookClient


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("notebook", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    kernel_root = root / ".venv/share/jupyter/kernels/chordly-ml"
    kernel_root.mkdir(parents=True, exist_ok=True)
    (kernel_root / "kernel.json").write_text(
        json.dumps(
            {
                "argv": [
                    sys.executable,
                    "-m",
                    "ipykernel_launcher",
                    "-f",
                    "{connection_file}",
                ],
                "display_name": "Chordly ML (.venv Python 3.12)",
                "language": "python",
            }
        ),
        encoding="utf-8",
    )
    os.environ["JUPYTER_PATH"] = str(root / ".venv/share/jupyter")
    os.environ["JUPYTER_RUNTIME_DIR"] = str(root / "data/.jupyter_runtime")
    os.environ["IPYTHONDIR"] = str(root / "data/.ipython")
    nb = nbformat.read(args.notebook, as_version=4)
    NotebookClient(
        nb,
        timeout=600,
        kernel_name="chordly-ml",
        resources={"metadata": {"path": str(root)}},
    ).execute()
    nbformat.write(nb, args.notebook)
    print(f"Executed and saved {args.notebook} using {sys.executable}")


if __name__ == "__main__":
    main()
