"""
Teach a small neural network to read handwritten digits (0-9).

Data: MNIST, 60,000 training pictures and 10,000 test pictures of
handwritten digits, each 28 x 28 pixels. It is downloaded from the Hugging
Face dataset "ylecun/mnist".

Model: a small convolutional network (two "pattern finder" layers, then two
ordinary layers). We train it 3 times with different random seeds, for
EPOCHS passes over the training pictures each, and test it on the 10,000
pictures it never saw while learning.

Outputs:
  results.csv     test accuracy after every epoch, for every seed
  examples.png    a few training pictures with their labels
  learning.png    test accuracy after each epoch
  mistakes.png    test pictures the network got wrong (from the first seed)
  mixups.png      which digits get mixed up with which (all seeds)

The last line printed is a JSON summary of the headline numbers.

Run:
  python3 experiment.py
"""

import csv
import io
import json
import os
import time

import matplotlib
import numpy as np
import pyarrow.parquet as pq
import torch
import torch.nn as nn
import torch.nn.functional as F
from huggingface_hub import hf_hub_download
from PIL import Image

matplotlib.use("Agg")  # draw to a file, no window needed
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

SEEDS = [0, 1, 2]
EPOCHS = int(os.environ.get("EPOCHS", 5))
BATCH_SIZE = 128
LEARNING_RATE = 1e-3
TRAIN_LIMIT = int(os.environ.get("TRAIN_LIMIT", 60_000))  # set lower for a quick local test
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def load_split(split):
    """Download one MNIST split and return (images as floats 0-1, labels)."""
    path = hf_hub_download("ylecun/mnist", f"mnist/{split}-00000-of-00001.parquet", repo_type="dataset")
    table = pq.read_table(path).to_pydict()
    images = np.stack([np.array(Image.open(io.BytesIO(img["bytes"]))) for img in table["image"]])
    return images.astype(np.float32) / 255.0, np.array(table["label"], dtype=np.int64)


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class SmallConvNet(nn.Module):
    """Two pattern-finder (convolution) layers, then two ordinary layers.

    The pattern finders slide small 3x3 windows over the picture and learn to
    spot strokes, curves and corners. The last layers combine those into a
    score for each digit 0-9; the highest score is the network's answer.
    """

    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, 3, padding=1)   # 28x28 -> 16 maps of 28x28
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)  # after pooling 14x14 -> 32 maps
        self.fc1 = nn.Linear(32 * 7 * 7, 128)
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = F.max_pool2d(F.relu(self.conv1(x)), 2)    # -> 16 x 14 x 14
        x = F.max_pool2d(F.relu(self.conv2(x)), 2)    # -> 32 x 7 x 7
        x = F.relu(self.fc1(x.flatten(1)))
        return self.fc2(x)


def count_parameters(model):
    return sum(p.numel() for p in model.parameters())


# ---------------------------------------------------------------------------
# Training and testing
# ---------------------------------------------------------------------------

def predict(model, images):
    """The network's answer (0-9) for every picture."""
    model.eval()
    answers = []
    with torch.no_grad():
        for start in range(0, len(images), 1000):
            answers.append(model(images[start:start + 1000]).argmax(1))
    return torch.cat(answers)


def train_one_seed(seed, train_x, train_y, test_x, test_y):
    """Train a fresh network; return accuracy after each epoch and final test answers."""
    torch.manual_seed(seed)
    model = SmallConvNet().to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    accuracies = []
    for epoch in range(EPOCHS):
        model.train()
        order = torch.randperm(len(train_x), device=DEVICE)
        for start in range(0, len(order), BATCH_SIZE):
            batch = order[start:start + BATCH_SIZE]
            loss = F.cross_entropy(model(train_x[batch]), train_y[batch])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        answers = predict(model, test_x)
        accuracies.append((answers == test_y).float().mean().item())
        print(f"seed {seed}  epoch {epoch + 1}  test accuracy {accuracies[-1]:.4f}", flush=True)
    return model, accuracies, answers


# ---------------------------------------------------------------------------
# Pictures
# ---------------------------------------------------------------------------

def save_examples(images, labels, path="examples.png"):
    fig, axes = plt.subplots(2, 8, figsize=(7.2, 2.4), dpi=160)
    for i, ax in enumerate(axes.flat):
        ax.imshow(images[i], cmap="gray_r")
        ax.set_title(str(labels[i]), fontsize=11)
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


def save_learning(all_acc, path="learning.png"):
    fig, ax = plt.subplots(figsize=(6.4, 3.8), dpi=160)
    epochs = np.arange(1, EPOCHS + 1)
    for seed, acc in zip(SEEDS, all_acc):
        ax.plot(epochs, 100 * np.array(acc), "o-", ms=4, label=f"try {seed + 1}")
    ax.set_xlabel("passes through the 60,000 training pictures")
    ax.set_ylabel("test pictures read correctly (%)")
    ax.set_xticks(epochs)
    ax.grid(True, alpha=0.3)
    ax.legend(frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


def save_mistakes(images, labels, answers, path="mistakes.png", count=16):
    wrong = np.flatnonzero(answers != labels)[:count]
    fig, axes = plt.subplots(2, 8, figsize=(7.2, 2.8), dpi=160)
    for ax, i in zip(axes.flat, wrong):
        ax.imshow(images[i], cmap="gray_r")
        ax.set_title(f"is {labels[i]}\nsaid {answers[i]}", fontsize=9)
        ax.axis("off")
    for ax in list(axes.flat)[len(wrong):]:
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


def save_mixups(confusion, path="mixups.png"):
    """Grid of how often each true digit (row) was read as each other digit (column)."""
    off = confusion.copy()
    np.fill_diagonal(off, 0)
    fig, ax = plt.subplots(figsize=(5.2, 4.6), dpi=160)
    im = ax.imshow(off, cmap="Oranges")
    for r in range(10):
        for c in range(10):
            if off[r, c]:
                ax.text(c, r, str(off[r, c]), ha="center", va="center", fontsize=8,
                        color="white" if off[r, c] > off.max() / 2 else "black")
    ax.set_xticks(range(10))
    ax.set_yticks(range(10))
    ax.set_xlabel("what the network said")
    ax.set_ylabel("what the digit really was")
    ax.set_title(f"Mistakes, added up over {len(SEEDS)} tries", fontsize=10)
    fig.colorbar(im, ax=ax, shrink=0.8)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def save_csv(all_acc, path="results.csv"):
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["seed", "epoch", "test_accuracy"])
        for seed, acc in zip(SEEDS, all_acc):
            for epoch, a in enumerate(acc, 1):
                writer.writerow([seed, epoch, f"{a:.4f}"])


def main():
    began = time.time()
    train_images, train_labels = load_split("train")
    test_images, test_labels = load_split("test")
    train_images, train_labels = train_images[:TRAIN_LIMIT], train_labels[:TRAIN_LIMIT]
    to_tensor = lambda a: torch.tensor(a, device=DEVICE).unsqueeze(1)
    train_x, test_x = to_tensor(train_images), to_tensor(test_images)
    train_y = torch.tensor(train_labels, device=DEVICE)
    test_y = torch.tensor(test_labels, device=DEVICE)

    all_acc, confusion, first_answers = [], np.zeros((10, 10), dtype=np.int64), None
    for seed in SEEDS:
        model, acc, answers = train_one_seed(seed, train_x, train_y, test_x, test_y)
        all_acc.append(acc)
        answers = answers.cpu().numpy()
        np.add.at(confusion, (test_labels, answers), 1)
        if first_answers is None:
            first_answers = answers
    seconds = time.time() - began

    save_csv(all_acc)
    save_examples(train_images, train_labels)
    save_learning(all_acc)
    save_mistakes(test_images, test_labels, first_answers)
    save_mixups(confusion)

    final = np.array([acc[-1] for acc in all_acc])
    off = confusion.copy()
    np.fill_diagonal(off, 0)
    r, c = np.unravel_index(off.argmax(), off.shape)
    print(json.dumps({
        "device": torch.cuda.get_device_name(0) if DEVICE == "cuda" else "cpu",
        "seconds": round(seconds, 1),
        "parameters": count_parameters(SmallConvNet()),
        "train_pictures": len(train_images),
        "test_pictures": len(test_images),
        "epochs": EPOCHS,
        "accuracy_after_1_epoch_pct": round(100 * float(np.mean([a[0] for a in all_acc])), 2),
        "final_accuracy_pct": round(100 * float(final.mean()), 2),
        "final_accuracy_spread_pct": round(100 * float(final.std()), 2),
        "mistakes_per_10000": round(float((1 - final.mean()) * 10_000)),
        "most_common_mixup": f"{r} read as {c}",
        "most_common_mixup_count": int(off[r, c]),
    }))


if __name__ == "__main__":
    main()
