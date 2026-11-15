import torch
from src.models.cnn import ChordCNN
from src.training.cnn import choose_threshold
import numpy as np
import pytest


def test_cnn_logits_gradients_and_checkpoint_roundtrip(tmp_path):
    torch.set_num_threads(2)
    torch.manual_seed(42)
    model = ChordCNN(25)
    x = torch.randn(2, 1, 128, 130)
    loss = torch.nn.CrossEntropyLoss()(model(x), torch.tensor([1, 24]))
    loss.backward()
    assert all(
        p.grad is not None and torch.isfinite(p.grad).all() for p in model.parameters()
    )
    model.eval()
    path = tmp_path / "weights.pt"
    torch.save(model.state_dict(), path)
    restored = ChordCNN(25)
    restored.load_state_dict(torch.load(path, weights_only=True))
    restored.eval()
    with torch.inference_mode():
        a = model(x)
        b = restored(x)
    assert a.shape == (2, 25) and torch.equal(a, b)


def test_threshold_never_treats_noise_as_accepted_chord():
    scores = np.tile([0.05, 0.95], (12, 1))
    result = choose_threshold(np.ones(12, dtype=int), scores, ["A", "Noise"])
    assert all(r["accepted"] == 0 for r in result["candidates"])


@pytest.mark.skipif(not torch.cuda.is_available(), reason="CUDA not available")
def test_cuda_backward_under_strict_determinism():
    from src.training.cnn import seed_all

    seed_all(42)
    model = ChordCNN(25).cuda()
    logits = model(torch.randn(2, 1, 128, 130, device="cuda"))
    torch.nn.CrossEntropyLoss()(logits, torch.tensor([1, 24], device="cuda")).backward()
    assert all(
        p.grad is not None and torch.isfinite(p.grad).all() for p in model.parameters()
    )
