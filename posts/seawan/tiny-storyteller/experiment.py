"""
Train a tiny storyteller: a small language model that learns to write like
Grimms' Fairy Tales, one letter at a time.

Data: grimm.txt, the text of Grimms' Fairy Tales (public domain, from
Project Gutenberg, with the Gutenberg header and licence removed).

Model: a very small "transformer", the same kind of model that powers AI
chatbots, but about a hundred thousand times smaller. It reads the last
CONTEXT letters and guesses the next one. We train it on 90% of the text and
keep 10% aside to test it on writing it has never seen.

While it learns, we stop at a few checkpoints and ask it to continue the
words "Once upon a time", so we can watch its writing improve.

Outputs:
  results.csv     training and test "surprise" (loss), and how often the
                  first guess is right, at every checkpoint
  samples.json    the story the model writes at each checkpoint
  probes.json     a close look inside the model, for the pictures: its odds
                  for the next letter, which letters it looks back at, the
                  same story written with the "adventure dial" turned to
                  three settings, and more
  learning.png    how surprised the model is by new text, as it learns
  samples.png     the stories from a few checkpoints, side by side

pictures.py turns results.csv, samples.json and probes.json into the rest of
the pictures and animations in the post.

The last line printed is a JSON summary of the headline numbers.

Run:
  python3 experiment.py && python3 pictures.py
"""

import csv
import json
import math
import os
import textwrap
import time

import matplotlib
import torch
import torch.nn as nn
import torch.nn.functional as F

matplotlib.use("Agg")  # draw to a file, no window needed
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

SEED = 0
STEPS = int(os.environ.get("STEPS", 2000))   # training steps (more makes it memorise the book)
CHECKPOINTS = sorted({0, 100, 300, 1000, STEPS})
CONTEXT = 128          # letters the model can look back at
BATCH_SIZE = 64
LAYERS, HEADS, WIDTH = 4, 4, 192
LEARNING_RATE = 1e-3
PROMPT = "Once upon a time"
SAMPLE_LENGTH = 300    # letters written at each checkpoint
TEMPERATURE = 0.8      # below 1 = a little less random when picking letters
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Probes: small, fixed questions we ask the model at every checkpoint
GUESS_PROMPTS = ["Once upon a ti", "The king and the qu"]
READ_ALONG = "Once upon a time the king held a great feast,"   # a sentence from the hidden 10% of the book
ATTENTION_TEXT = "Once upon a time there was a king who had a daugh"
DIAL_SETTINGS = [0.3, 0.8, 1.5]   # temperature: low = careful, high = adventurous
TYPEWRITER_LETTERS = 60


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def load_text(path="grimm.txt"):
    """Read the book and turn every letter into a number (its position in the alphabet we found)."""
    text = open(path, encoding="utf-8").read()
    alphabet = sorted(set(text))
    to_id = {ch: i for i, ch in enumerate(alphabet)}
    ids = torch.tensor([to_id[ch] for ch in text], dtype=torch.long)
    split = int(0.9 * len(ids))
    return ids[:split], ids[split:], alphabet


def random_batch(ids, generator, keep=None):
    """BATCH_SIZE random stretches of text, and the same stretches shifted by one letter (the answers).
    If keep is a list, the start positions are added to it (for the pictures)."""
    starts = torch.randint(0, len(ids) - CONTEXT - 1, (BATCH_SIZE,), generator=generator)
    if keep is not None:
        keep.extend(starts.tolist())
    x = torch.stack([ids[s:s + CONTEXT] for s in starts])
    y = torch.stack([ids[s + 1:s + CONTEXT + 1] for s in starts])
    return x.to(DEVICE), y.to(DEVICE)


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class Block(nn.Module):
    """One transformer layer: look back at earlier letters (attention), then think (MLP)."""

    def __init__(self):
        super().__init__()
        self.norm1 = nn.LayerNorm(WIDTH)
        self.attention = nn.MultiheadAttention(WIDTH, HEADS, batch_first=True)
        self.norm2 = nn.LayerNorm(WIDTH)
        self.mlp = nn.Sequential(nn.Linear(WIDTH, 4 * WIDTH), nn.GELU(), nn.Linear(4 * WIDTH, WIDTH))

    def forward(self, x, mask):
        h = self.norm1(x)
        x = x + self.attention(h, h, h, attn_mask=mask, need_weights=False)[0]
        return x + self.mlp(self.norm2(x))


class TinyStoryteller(nn.Module):
    """Reads up to CONTEXT letters and gives a score for every possible next letter."""

    def __init__(self, alphabet_size):
        super().__init__()
        self.letter = nn.Embedding(alphabet_size, WIDTH)
        self.position = nn.Embedding(CONTEXT, WIDTH)
        self.blocks = nn.ModuleList(Block() for _ in range(LAYERS))
        self.norm = nn.LayerNorm(WIDTH)
        self.out = nn.Linear(WIDTH, alphabet_size)

    def forward(self, ids):
        n = ids.shape[1]
        x = self.letter(ids) + self.position(torch.arange(n, device=ids.device))
        # each letter may only look at letters before it, never ahead
        mask = torch.triu(torch.ones(n, n, dtype=torch.bool, device=ids.device), diagonal=1)
        for block in self.blocks:
            x = block(x, mask)
        return self.out(self.norm(x))


@torch.no_grad()
def write_story(model, alphabet, generator):
    """Continue PROMPT one letter at a time, picking each letter by the model's odds."""
    model.eval()
    to_id = {ch: i for i, ch in enumerate(alphabet)}
    ids = torch.tensor([[to_id[ch] for ch in PROMPT]], device=DEVICE)
    for _ in range(SAMPLE_LENGTH):
        scores = model(ids[:, -CONTEXT:])[0, -1] / TEMPERATURE
        odds = F.softmax(scores, dim=-1).cpu()
        next_id = torch.multinomial(odds, 1, generator=generator).to(DEVICE)
        ids = torch.cat([ids, next_id.view(1, 1)], dim=1)
    model.train()
    return "".join(alphabet[i] for i in ids[0].tolist())


@torch.no_grad()
def average_loss(model, ids, generator, batches=20):
    """Average 'surprise' (cross-entropy, in nats per letter) on random stretches of ids,
    and the share of letters where the model's first choice was the right one."""
    model.eval()
    total, right = 0.0, 0.0
    for _ in range(batches):
        x, y = random_batch(ids, generator)
        scores = model(x)
        total += F.cross_entropy(scores.flatten(0, 1), y.flatten()).item()
        right += (scores.argmax(-1) == y).float().mean().item()
    model.train()
    return total / batches, right / batches


# ---------------------------------------------------------------------------
# Probes: looking inside the model, for the pictures
# ---------------------------------------------------------------------------

def encode(text, alphabet):
    to_id = {ch: i for i, ch in enumerate(alphabet)}
    return torch.tensor([[to_id[ch] for ch in text]], device=DEVICE)


@torch.no_grad()
def next_letter_odds(model, alphabet, text):
    """The model's odds (0 to 1) for every possible next letter after text."""
    model.eval()
    odds = F.softmax(model(encode(text, alphabet)[:, -CONTEXT:])[0, -1], dim=-1).cpu()
    model.train()
    return [round(p, 5) for p in odds.tolist()]


def top(odds, alphabet, k):
    best = sorted(range(len(odds)), key=lambda i: -odds[i])[:k]
    return [[alphabet[i], odds[i]] for i in best]


@torch.no_grad()
def read_along(model, alphabet, before, sentence):
    """Guess each letter of sentence from the letters before it; report the top 3 guesses and the real letter."""
    out = []
    for i, real in enumerate(sentence):
        odds = next_letter_odds(model, alphabet, before + sentence[:i])
        out.append({"real": real, "real_odds": odds[alphabet.index(real)], "top": top(odds, alphabet, 3)})
    return out


@torch.no_grad()
def attention_weights(model, alphabet, text):
    """For the last letter of text: how much each layer looks back at each earlier letter (heads averaged)."""
    model.eval()
    ids = encode(text, alphabet)
    n = ids.shape[1]
    x = model.letter(ids) + model.position(torch.arange(n, device=DEVICE))
    mask = torch.triu(torch.ones(n, n, dtype=torch.bool, device=DEVICE), diagonal=1)
    layers = []
    for block in model.blocks:
        h = block.norm1(x)
        a, w = block.attention(h, h, h, attn_mask=mask, need_weights=True, average_attn_weights=True)
        layers.append([round(v, 4) for v in w[0, -1].tolist()])
        x = x + a
        x = x + block.mlp(block.norm2(x))
    odds = F.softmax(model.out(model.norm(x))[0, -1], dim=-1).tolist()
    model.train()
    return {"text": text, "layers": layers, "top": top(odds, alphabet, 5)}


@torch.no_grad()
def typewriter(model, alphabet, generator, letters):
    """Write after PROMPT, keeping the top 5 odds at each letter and the letter that was picked."""
    model.eval()
    ids = encode(PROMPT, alphabet)
    frames = []
    for _ in range(letters):
        odds = F.softmax(model(ids[:, -CONTEXT:])[0, -1] / TEMPERATURE, dim=-1).cpu()
        next_id = torch.multinomial(odds, 1, generator=generator).item()
        frames.append({"top": top([round(p, 4) for p in odds.tolist()], alphabet, 5), "picked": alphabet[next_id]})
        ids = torch.cat([ids, torch.tensor([[next_id]], device=DEVICE)], dim=1)
    model.train()
    return frames


@torch.no_grad()
def write_with_dial(model, alphabet, temperature, seed, letters=200):
    """Like write_story, with the 'adventure dial' (temperature) set by hand."""
    model.eval()
    generator = torch.Generator().manual_seed(seed)
    ids = encode(PROMPT, alphabet)
    for _ in range(letters):
        odds = F.softmax(model(ids[:, -CONTEXT:])[0, -1] / temperature, dim=-1).cpu()
        ids = torch.cat([ids, torch.multinomial(odds, 1, generator=generator).view(1, 1).to(DEVICE)], dim=1)
    model.train()
    return "".join(alphabet[i] for i in ids[0].tolist())


# ---------------------------------------------------------------------------
# Pictures
# ---------------------------------------------------------------------------

def save_learning(rows, path="learning.png"):
    fig, ax = plt.subplots(figsize=(6.4, 3.8), dpi=160)
    steps = [r["step"] for r in rows]
    # perplexity = e^loss: "how many letters it is torn between", easier to read than loss
    ax.plot(steps, [math.exp(r["train_loss"]) for r in rows], "o-", color="#2557a7", label="text it learned from")
    ax.plot(steps, [math.exp(r["test_loss"]) for r in rows], "s-", color="#c2410c", label="text it never saw")
    ax.set_xscale("symlog", linthresh=100)
    ax.set_xlabel("training steps")
    ax.set_ylabel("letters it is torn between")
    ax.grid(True, alpha=0.3)
    ax.legend(frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


def save_samples(samples, path="samples.png"):
    shown = [s for s in samples if s["step"] in (0, 300, 1000, STEPS)]
    fig, axes = plt.subplots(len(shown), 1, figsize=(7.2, 1.9 * len(shown)), dpi=160)
    for ax, s in zip(axes, shown):
        story = s["story"][:200].replace("\n", " ")
        ax.text(0, 1, f"After {s['step']:,} steps:", fontsize=10, weight="bold", va="top", transform=ax.transAxes)
        ax.text(0, 0.78, "\n".join(textwrap.wrap(story, 78)), fontsize=9, family="monospace", va="top",
                transform=ax.transAxes)
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    began = time.time()
    torch.manual_seed(SEED)
    batches = torch.Generator().manual_seed(SEED)
    sampler = torch.Generator().manual_seed(SEED + 1)
    train_ids, test_ids, alphabet = load_text()
    model = TinyStoryteller(len(alphabet)).to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE)
    parameters = sum(p.numel() for p in model.parameters())
    print(f"{parameters:,} parameters, {len(alphabet)} different letters, {len(train_ids):,} training letters")

    # the hidden sentence and the 128 letters before it, straight from the test part of the book
    test_text = "".join(alphabet[i] for i in test_ids.tolist())
    at = test_text.index(READ_ALONG)
    read_before = test_text[max(0, at - CONTEXT):at]
    probes = {"alphabet": alphabet, "prompt": PROMPT, "context": CONTEXT, "batch_size": BATCH_SIZE,
              "temperature": TEMPERATURE, "book_letters": len(train_ids) + len(test_ids),
              "training_letters": len(train_ids), "test_letters": len(test_ids),
              "first_batch_starts": [], "guess_prompts": GUESS_PROMPTS,
              "read_along_sentence": READ_ALONG, "odds": [], "read_along": [],
              "parameters": parameters, "layers": LAYERS, "heads": HEADS, "width": WIDTH}

    rows, samples = [], []
    for step in range(STEPS + 1):
        if step in CHECKPOINTS:
            train_loss, train_right = average_loss(model, train_ids, batches)
            test_loss, test_right = average_loss(model, test_ids, batches)
            row = {"step": step, "train_loss": train_loss, "test_loss": test_loss,
                   "train_first_guess_right": train_right, "test_first_guess_right": test_right}
            rows.append(row)
            samples.append({"step": step, "story": write_story(model, alphabet, sampler)})
            probes["odds"].append({"step": step, **{t: next_letter_odds(model, alphabet, t) for t in GUESS_PROMPTS}})
            probes["read_along"].append({"step": step, "guesses": read_along(model, alphabet, read_before, READ_ALONG)})
            print(f"step {step:>5}  train {row['train_loss']:.3f}  test {row['test_loss']:.3f}  "
                  f"first guess right on new text {100 * test_right:.1f}%", flush=True)
        if step == STEPS:
            break
        # learning rate fades to zero by the end (cosine schedule)
        for group in optimizer.param_groups:
            group["lr"] = LEARNING_RATE * 0.5 * (1 + math.cos(math.pi * step / STEPS))
        # remember where the very first practice step reads from, for the pictures
        x, y = random_batch(train_ids, batches, keep=probes["first_batch_starts"] if step == 0 else None)
        loss = F.cross_entropy(model(x).flatten(0, 1), y.flatten())
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        if step % 50 == 0:
            print(f"step {step:>5}  practice loss {loss.item():.3f}", flush=True)  # also keeps the log stream alive
    probes["attention"] = attention_weights(model, alphabet, ATTENTION_TEXT)
    probes["typewriter"] = typewriter(model, alphabet, torch.Generator().manual_seed(SEED + 2), TYPEWRITER_LETTERS)
    probes["dial"] = [{"temperature": t, "story": write_with_dial(model, alphabet, t, SEED + 3)} for t in DIAL_SETTINGS]
    seconds = time.time() - began

    with open("results.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["step", "train_loss", "test_loss", "train_first_guess_right", "test_first_guess_right"])
        writer.writeheader()
        for r in rows:
            writer.writerow({k: (f"{v:.4f}" if isinstance(v, float) else v) for k, v in r.items()})
    with open("samples.json", "w", encoding="utf-8") as f:
        json.dump(samples, f, indent=2, ensure_ascii=False)
    with open("probes.json", "w", encoding="utf-8") as f:
        json.dump(probes, f, ensure_ascii=False)
    save_learning(rows)
    save_samples(samples)

    print(f"\n--- story after {STEPS} steps ---\n{samples[-1]['story']}\n")
    first, last = rows[0], rows[-1]
    print(json.dumps({
        "device": torch.cuda.get_device_name(0) if DEVICE == "cuda" else "cpu",
        "seconds": round(seconds, 1),
        "parameters": parameters,
        "alphabet_size": len(alphabet),
        "training_letters": len(train_ids),
        "steps": STEPS,
        "torn_between_start": round(math.exp(first["test_loss"]), 1),
        "torn_between_end": round(math.exp(last["test_loss"]), 2),
        "test_loss_end": round(last["test_loss"], 3),
        "train_loss_end": round(last["train_loss"], 3),
        "first_guess_right_start_pct": round(100 * first["test_first_guess_right"], 1),
        "first_guess_right_end_pct": round(100 * last["test_first_guess_right"], 1),
        "torn_between_train_end": round(math.exp(last["train_loss"]), 2),
    }))


if __name__ == "__main__":
    main()
