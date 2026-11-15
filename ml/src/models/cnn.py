"""Small randomly initialized CNN; preserve frequency position to distinguish pitches."""

import torch
from torch import nn


class TemporalMean(nn.Module):
    """Average time without CUDA adaptive-pooling's nondeterministic backward."""

    def forward(self, x):
        return x.mean(dim=-1, keepdim=True)


class ChordCNN(nn.Module):
    def __init__(self, num_classes: int, n_mels: int = 128):
        super().__init__()
        if n_mels < 8:
            raise ValueError(
                "At least 8 Mel bands are required for three pooling blocks"
            )
        blocks = []
        previous = 1
        for channels in [16, 32, 64]:
            blocks.extend(
                [
                    nn.Conv2d(previous, channels, 3, padding=1),
                    nn.BatchNorm2d(channels),
                    nn.ReLU(),
                    nn.MaxPool2d(2),
                ]
            )
            previous = channels
        # Do not average the whole frequency axis: absolute pitch matters.
        self.features = nn.Sequential(*blocks, TemporalMean())
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * (n_mels // 8), 128),
            nn.ReLU(),
            nn.Dropout(0.25),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x))  # logits, not softmax
