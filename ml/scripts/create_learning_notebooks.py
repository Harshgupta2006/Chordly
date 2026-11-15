"""Create report-reading notebooks; execution never silently retrains/retests a model."""

from pathlib import Path
import nbformat as nb


def main():
    root = Path(__file__).resolve().parents[1]
    md = nb.v4.new_markdown_cell
    code = nb.v4.new_code_cell
    setup = """from pathlib import Path
import json, sys
import pandas as pd
from IPython.display import display, Image
root=Path.cwd()
if root.name != "ml": root=root/"ml"
assert Path(sys.executable).resolve()==(root/".venv/Scripts/python.exe").resolve()
sys.path.insert(0,str(root))
def read(path): return json.loads((root/path).read_text())
"""
    notebooks = {
        "02_preprocessing.ipynb": [
            md(
                "# Shared preprocessing and leakage boundaries\nRead `LEARNING_GUIDE.md` for fundamentals. The waveform transform is shared by training and inference. To regenerate arrays, run `ml/scripts/preprocess_all.py` from the repository root only after verified EDA."
            ),
            code(setup),
            code(
                'split=read("data/processed/split_manifest.json")\nprint(split["split_unit"])\nprint(split["grouping_limitations"])\ndisplay(pd.DataFrame(split["counts"]))\nassert not set(split["parts"]["train"]) & set(split["parts"]["validation"])'
            ),
            md(
                "## Two versus three seconds\nLonger windows retain more chord energy, but duration is selected using training-derived validation. Noise is not independently peak-normalized. Test recordings never fit preprocessing statistics."
            ),
            code(
                'import numpy as np\nfor duration in [2,3]:\n    data=np.load(root/f"data/processed/train_{duration}s.npz")\n    print(duration,"seconds",data["mel"].shape,data["baseline"].shape)\ndisplay(Image(filename=str(root/"data/eda_output/two_vs_three_seconds.png")))'
            ),
            code(
                'from src.preprocessing.audio import AudioConfig\nfrom src.features.spectral import MelConfig\nprint(AudioConfig(duration=3.0))\nprint(MelConfig())\nprint("Tests verify inference features match cached training transforms.")'
            ),
        ],
        "03_baseline.ipynb": [
            md(
                "# Traditional SVM baseline\nAn SVM gives us a meaningful comparison before claiming a CNN is useful. We summarize each recording with 88 MFCC/chroma/energy/spectral features. A training-only StandardScaler precedes an RBF SVM."
            ),
            code(setup),
            code(
                'experiments=read("artifacts/baseline/validation_experiments.json")\ndisplay(pd.DataFrame([{**e["config"],"validation_accuracy":e["metrics"]["accuracy"],"validation_macro_f1":e["metrics"]["macro_f1"]} for e in experiments]))'
            ),
            md(
                "## Selection\nC changes regularization and gamma changes the locality of the RBF boundary. Class balancing addresses uneven class counts; it does not create independent Noise recordings. The best of 12 validation candidates is selected; official test scores are not used for selection."
            ),
            code(
                'display(read("artifacts/baseline/selected_config.json"))\ndisplay(Image(filename=str(root/"artifacts/baseline/validation_metrics.png")))'
            ),
        ],
        "04_cnn_training.ipynb": [
            md(
                "# Our randomly initialized CNN\nThree Conv/ReLU/BatchNorm/pooling blocks learn patterns from Log-Mel. A time mean retains frequency position. Cross entropy operates on logits; AdamW updates weights. Dropout and validation-based early stopping limit overfitting. No pretrained weights or AI APIs are used."
            ),
            code(setup),
            code(
                'from src.models.cnn import ChordCNN\nconfig=read("artifacts/cnn/config.json")\nmodel=ChordCNN(len(config["class_names"]))\nprint(model)\nprint("Parameters:",sum(p.numel() for p in model.parameters()))\nprint(config["weights_origin"])\nprint("Device:",config["device"],"Batch:",config["batch_size"],"AMP:",config["amp"])'
            ),
            code(
                'display(read("artifacts/cnn/best_epoch.json"))\ndisplay(pd.DataFrame(read("artifacts/cnn/history.json")).tail())\ndisplay(Image(filename=str(root/"artifacts/cnn/learning_curves.png")))'
            ),
            md(
                "## Checkpoint and inference\nThe best weights and final resumable optimizer/RNG state are separate artifacts. Never overwrite the final evaluated model while experimenting. The resume test works on a separate copy. Standardization uses training-only per-band statistics saved in config.json. Run training explicitly from the CLI, not automatically by re-opening this report notebook."
            ),
        ],
        "05_evaluation.ipynb": [
            md(
                "# Frozen official-test evaluation\nModels and rejection threshold were frozen before one final evaluation. Re-running this notebook reads saved results; it does not retest or tune. Macro metrics give each class equal weight."
            ),
            code(setup),
            code(
                'final=read("artifacts/evaluation/final_test_evaluation.json")\ndisplay(pd.DataFrame(final["summary"]).T)\nprint("Acceptance:",final["rejection"])\nprint("The SVM outperformed the CNN on this official test set.")'
            ),
            code(
                'for model in ["svm","cnn"]:\n    display(Image(filename=str(root/f"artifacts/evaluation/{model}_test_metrics.png")))\nerrors=[{"actual":r["actual"],"predicted":r["predicted_class"],"score":r["model_score"]} for r in final["predictions"] if r["actual"]!=r["predicted_class"]]\ndisplay(pd.DataFrame(errors))'
            ),
            md(
                "## Interpretation and next independent test\nThe CNN misses every test D and often confuses F# with F#m. Diagnostic chroma still distinguishes the expected major/minor thirds; do not relabel test audio based on model mistakes. The exact cause needs independent investigation. Noise support is only three files. A validation-selected score threshold did not reject test mistakes adequately. Scores are uncalibrated, and a different guitar/microphone may perform worse.\n\nCollect personal recordings as a separate holdout and run `evaluate_personal.py`. Save the initial results before discussing data collection/fine-tuning. Physical microphone and rendered browser verification are pending because the UI automation host was unavailable."
            ),
            code(
                'display(read("artifacts/cnn/rejection.json")["validation_selection"])\nfor limitation in final["limitations"]: print("-",limitation)'
            ),
        ],
    }
    for name, cells in notebooks.items():
        path = root / "notebooks" / name
        if path.exists():
            raise FileExistsError(f"Preserving existing notebook: {path}")
        document = nb.v4.new_notebook(cells=cells)
        document.metadata["kernelspec"] = {
            "name": "chordly-ml",
            "display_name": "Chordly ML (.venv Python 3.12)",
            "language": "python",
        }
        nb.write(document, path)
        print("Created", path.name)


if __name__ == "__main__":
    main()
