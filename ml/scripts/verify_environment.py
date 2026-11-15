"""
ml/scripts/verify_environment.py
==================================
Verifies that all ML dependencies are correctly installed and that
CUDA (GPU acceleration) is available for PyTorch training.

HOW TO RUN
----------
  cd c:\\Users\\harsh\\Downloads\\Coding\\Chordly\\ml
  .venv\\Scripts\\activate
  python scripts/verify_environment.py

WHAT THIS CHECKS
----------------
1. Python version (must be 3.10+)
2. All required packages importable
3. Package versions
4. PyTorch CUDA availability
5. GPU name and VRAM
6. librosa can load a synthetic audio signal (sanity check)
7. numpy, scikit-learn basic ops

CONCEPTS
--------
- torch.cuda.is_available(): Returns True if PyTorch was compiled with CUDA
  support AND an NVIDIA GPU is detected and drivers are working.
- torch.cuda.get_device_name(0): Returns the GPU model name (e.g. "NVIDIA
  GeForce RTX 3050").
- torch.cuda.get_device_properties(0).total_memory: Total VRAM in bytes.
  Divide by 1024^3 to get GiB.
"""

import sys


def check(label: str, fn):
    """Run fn(), print the result. Return False if fn() raises."""
    try:
        result = fn()
        print(f"  ✓  {label}: {result}")
        return True
    except Exception as e:
        print(f"  ✗  {label}: FAILED — {e}")
        return False


def main():
    print("=" * 60)
    print("Chordly ML — Environment Verification")
    print("=" * 60)

    all_ok = True

    # --- Python version ---
    print("\n[1] Python")
    ver = sys.version_info
    if ver >= (3, 10):
        print(f"  ✓  Python {ver.major}.{ver.minor}.{ver.micro}")
    else:
        print(f"  ✗  Python {ver.major}.{ver.minor} — need 3.10+")
        all_ok = False

    # --- Core packages ---
    print("\n[2] Core packages")
    packages = [
        ("numpy", lambda: __import__("numpy").__version__),
        ("scipy", lambda: __import__("scipy").__version__),
        ("librosa", lambda: __import__("librosa").__version__),
        ("soundfile", lambda: __import__("soundfile").__version__),
        ("sklearn (scikit-learn)", lambda: __import__("sklearn").__version__),
        ("matplotlib", lambda: __import__("matplotlib").__version__),
        ("seaborn", lambda: __import__("seaborn").__version__),
        ("datasets (HuggingFace)", lambda: __import__("datasets").__version__),
        ("torch", lambda: __import__("torch").__version__),
        ("torchvision", lambda: __import__("torchvision").__version__),
        ("torchaudio", lambda: __import__("torchaudio").__version__),
        ("ipykernel", lambda: __import__("ipykernel").__version__),
        ("nbformat", lambda: __import__("nbformat").__version__),
        ("nbclient", lambda: __import__("nbclient").__version__),
    ]
    for label, fn in packages:
        ok = check(label, fn)
        if not ok:
            all_ok = False

    # --- PyTorch CUDA ---
    print("\n[3] PyTorch CUDA (GPU)")
    try:
        import torch

        cuda_available = torch.cuda.is_available()
        if cuda_available:
            gpu_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            vram_gib = props.total_memory / (1024**3)
            cuda_version = torch.version.cuda
            print(f"  ✓  CUDA available: True")
            print(f"  ✓  GPU: {gpu_name}")
            print(f"  ✓  VRAM: {vram_gib:.1f} GiB")
            print(f"  ✓  CUDA version (PyTorch build): {cuda_version}")
            print(f"  ✓  Device count: {torch.cuda.device_count()}")

            # Quick tensor op on GPU to confirm it actually works
            x = torch.randn(64, 64, device="cuda")
            y = torch.matmul(x, x.T)
            print(
                f"  ✓  GPU tensor op (64×64 matmul): OK — result shape {tuple(y.shape)}"
            )
        else:
            print("  ✗  CUDA not available — PyTorch will use CPU only.")
            print("     If you have an RTX 3050, check:")
            print("       1. CUDA drivers installed? Run: nvidia-smi")
            print("       2. Correct torch+cu121 wheel installed?")
            all_ok = False

    except Exception as e:
        print(f"  ✗  PyTorch CUDA check failed: {e}")
        all_ok = False

    # --- Librosa sanity check ---
    print("\n[4] Librosa audio sanity check")
    try:
        import numpy as np
        import librosa

        # Generate a 440 Hz sine wave (1 second, 22050 Hz) — no file needed
        sr = 22050
        t = np.linspace(0, 1.0, sr, endpoint=False)
        sine_wave = 0.5 * np.sin(2 * np.pi * 440 * t).astype(np.float32)

        # Compute mel spectrogram
        mel = librosa.feature.melspectrogram(
            y=sine_wave, sr=sr, n_fft=2048, hop_length=512, n_mels=128
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)

        print(f"  ✓  Synthetic 440 Hz sine wave: shape {sine_wave.shape}")
        print(f"  ✓  Mel spectrogram shape: {mel.shape}")
        print(f"  ✓  Log-Mel spectrogram shape: {mel_db.shape}")
        print(f"  ✓  dB range: [{mel_db.min():.1f}, {mel_db.max():.1f}]")
    except Exception as e:
        print(f"  ✗  Librosa sanity check failed: {e}")
        all_ok = False

    # --- Summary ---
    print("\n" + "=" * 60)
    if all_ok:
        print(
            "✓  Environment checks passed. Dataset/EDA gates must still pass before training."
        )
    else:
        print("✗  Some checks failed. Review the errors above before continuing.")
    print("=" * 60)
    return all_ok


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
