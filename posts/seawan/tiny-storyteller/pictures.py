"""
Pictures and animations for "A tiny storyteller", made from what experiment.py
saved: results.csv, samples.json and probes.json (and the book, grimm.txt).

Every number and letter in these pictures comes from those files: the model's
real odds, its real guesses and its real stories. Nothing is made up or tidied.

Outputs:
  book.png         the book as one long line of letters, split into practice and hidden parts
  alphabet.png     every letter and symbol the model can choose from, shaded by how common it is
  practice.png     where the first practice step read from, and how one stretch becomes many guessing questions
  model.png        what happens inside the model when it makes one guess
  torn.png         "torn between": a coin, a dice, and our model before and after practice
  odds.gif         its odds for the letter after "Once upon a ti", at each checkpoint (animation)
  odds.png         the same odds, before and after practice, for two beginnings
  read-along.gif   the trained model guessing a hidden sentence, letter by letter (animation)
  read-along.png   the same sentence at every checkpoint: green = first guess right
  first-guess.png  out of 100 guesses, how many first guesses were right, at each checkpoint
  typewriter.gif   the trained model writing a story, one letter at a time, with its odds (animation)
  growing.gif      the story it writes at each checkpoint (animation)
  attention.png    which earlier letters it looks back at most, for one guess
  dial.png         the same model writing with the "adventure dial" set to careful, normal and wild

Run (after experiment.py):
  python3 pictures.py
"""

import csv
import io
import json
import math
import textwrap
from collections import Counter

import matplotlib
from PIL import Image

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch, Rectangle, Wedge

BLUE, ORANGE, GREEN, RED, GREY, INK = "#2557a7", "#c2410c", "#15803d", "#b91c1c", "#9ca3af", "#1f2937"
PALE_BLUE, PALE_ORANGE, PALE_GREEN, PALE_RED = "#dbe6f7", "#fbe3d6", "#dcfce7", "#fee2e2"
MONO = "DejaVu Sans Mono"
plt.rcParams.update({"font.size": 11, "axes.spines.top": False, "axes.spines.right": False})


def show(ch):
    """How to draw one letter on a tile: spaces and line breaks get a visible sign."""
    return {" ": "␣", "\n": "↵", None: ""}.get(ch, ch)


def flat(text):
    return text.replace("\n", " ")


def save(fig, path):
    fig.savefig(path, facecolor="white", dpi=150, bbox_inches="tight", pad_inches=0.15)
    plt.close(fig)


def frame(fig):
    """Render a figure to a picture, for an animation."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor="white", dpi=100)
    plt.close(fig)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def save_gif(frames, durations, path):
    """frames: list of pictures; durations in milliseconds (one per frame). Loops forever."""
    pal = [f.quantize(colors=64, method=Image.Quantize.MEDIANCUT) for f in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True)


def torn_between(odds):
    """How many choices a set of odds is 'torn between' (e to the power of its entropy)."""
    return math.exp(-sum(p * math.log(p) for p in odds if p > 0))


def tile(ax, x, y, ch, face="white", edge=GREY, color=INK, w=0.9, h=0.9, size=12, weight="normal"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.12", facecolor=face, edgecolor=edge, lw=1))
    ax.text(x + w / 2, y + h / 2, show(ch), ha="center", va="center", family=MONO, fontsize=size, color=color, weight=weight)


# ---------------------------------------------------------------------------
# The setting: the book, the letters, the practice
# ---------------------------------------------------------------------------

def book_picture(P, book):
    total, train, test = P["book_letters"], P["training_letters"], P["test_letters"]
    fig, ax = plt.subplots(figsize=(8, 3.4))
    ax.set_xlim(0, 100), ax.set_ylim(0, 34), ax.axis("off")
    split = 100 * train / total
    ax.add_patch(Rectangle((0, 14), split, 6, color=BLUE))
    ax.add_patch(Rectangle((split, 14), 100 - split, 6, color=ORANGE))
    ax.text(split / 2, 17, f"practice part: {train:,} letters (90%)", ha="center", va="center", color="white", weight="bold")
    ax.text(100, 11.5, f"hidden part: {test:,} letters (10%)", ha="right", va="top", color=ORANGE, fontsize=9.5, weight="bold")
    ax.text(0, 31, f"Grimms' Fairy Tales, written out as one long line of {total:,} letters", fontsize=12, weight="bold", color=INK)
    ax.text(0, 27, "The model practises on the blue part. We keep the orange part hidden, to test it later.", fontsize=10, color=INK)
    # zoom in on the very start of the book
    ax.plot([0, 0], [14, 8.2], color=GREY, lw=1), ax.plot([0.3, 70], [14, 8.2], color=GREY, lw=1)
    piece = book[:44]
    for i, ch in enumerate(piece):
        tile(ax, i * 1.6, 3.2, ch, w=1.45, h=5, size=9)
    ax.text(0, 0.2, "Zoomed in: every letter, space (␣), comma and line break (↵) counts as a 'letter'.", fontsize=9.5, color=INK)
    save(fig, "book.png")


def alphabet_picture(P, book):
    alphabet, counts = P["alphabet"], Counter(book)
    order = sorted(alphabet, key=lambda c: -counts[c])
    cols = 14
    rows = math.ceil(len(order) / cols)
    fig, ax = plt.subplots(figsize=(8, 0.75 * rows + 1.3))
    ax.set_xlim(0, cols), ax.set_ylim(-0.2, rows + 1.1), ax.axis("off"), ax.set_aspect("equal")
    top = counts[order[0]]
    cmap = plt.get_cmap("Blues")
    for k, ch in enumerate(order):
        r, c = divmod(k, cols)
        share = math.log(counts[ch]) / math.log(top)
        face = cmap(0.08 + 0.85 * share)
        tile(ax, c, rows - 1 - r, ch, face=face, color="white" if share > 0.6 else INK, size=11)
    ax.text(0, rows + 0.4, f"The {len(alphabet)} 'letters' the model can choose from, most common first",
            fontsize=12, weight="bold", color=INK)
    common = ", ".join(f"'{show(c)}' {100 * counts[c] / len(book):.0f}%" for c in order[:3])
    ax.text(0, -0.15, f"Darker = more common in the book. The most common: {common}.", fontsize=9.5, color=INK, va="top")
    save(fig, "alphabet.png")


def practice_picture(P, book):
    starts, ctx, train = P["first_batch_starts"], P["context"], P["training_letters"]
    fig = plt.figure(figsize=(8, 5.4))
    ax = fig.add_axes([0.03, 0.62, 0.94, 0.36])
    ax.set_xlim(0, 100), ax.set_ylim(0, 12), ax.axis("off")
    ax.add_patch(Rectangle((0, 2), 100, 3, color=PALE_BLUE))
    for s in starts:
        x = 100 * s / train
        ax.plot([x, x], [5, 8.2], color=BLUE, lw=1)
        ax.add_patch(Circle((x, 8.6), 0.55, color=BLUE))
    ax.text(0, 10.6, f"The first practice step: {len(starts)} stretches of {ctx} letters, from random places",
            fontsize=11.5, weight="bold", color=INK)
    ax.text(0, 0, "start of the practice part", fontsize=8.5, color=GREY), ax.text(100, 0, "end", fontsize=8.5, color=GREY, ha="right")

    bx = fig.add_axes([0.03, 0.02, 0.94, 0.56])
    n = 16
    s = starts[0]
    piece = book[s:s + n + 1]
    bx.set_xlim(-3.2, n + 0.5), bx.set_ylim(-0.6, 6.4), bx.axis("off")
    bx.text(-3.2, 5.9, f"Zoom in on the first stretch (its first {n} letters). Every letter is a guessing question:",
            fontsize=10.5, color=INK)
    bx.text(-3.2, 3.95, "the model\nreads", fontsize=9, color=BLUE, va="center")
    bx.text(-3.2, 1.45, "and must\nguess", fontsize=9, color=ORANGE, va="center")
    for i in range(n):
        tile(bx, i, 3.5, piece[i], face=PALE_BLUE, edge=BLUE, size=11)
        tile(bx, i, 1.0, piece[i + 1], face=PALE_ORANGE, edge=ORANGE, size=11)
        bx.annotate("", xy=(i + 0.45, 1.95), xytext=(i + 0.45, 3.45), arrowprops=dict(arrowstyle="->", color=GREY, lw=0.8))
    bx.text(-3.2, 0.1, f"Reading up to letter 1 it guesses letter 2, reading up to letter 2 it guesses letter 3, and so on: "
            f"{ctx} questions per stretch,\n{len(starts) * ctx:,} questions per practice step. After each step it nudges its "
            f"{P['parameters']:,} numbers a little, towards the right answers.", fontsize=8.8, color=INK, va="top")
    save(fig, "practice.png")


def model_picture(P):
    final = P["odds"][-1][P["guess_prompts"][0]]
    best = sorted(range(len(final)), key=lambda i: -final[i])[:2]
    example = "\n".join(f"{show(P['alphabet'][i])}  {100 * final[i]:.0f}%" for i in best)
    fig, ax = plt.subplots(figsize=(8, 3.6))
    ax.set_xlim(0, 100), ax.set_ylim(0, 40), ax.axis("off")

    def box(x, w, title, body, face, edge):
        ax.add_patch(FancyBboxPatch((x, 7), w, 24, boxstyle="round,pad=0.4,rounding_size=1.5", facecolor=face, edgecolor=edge, lw=1.5))
        ax.text(x + w / 2, 27.5, title, ha="center", va="center", weight="bold", fontsize=10.5, color=INK)
        ax.text(x + w / 2, 17, body, ha="center", va="center", fontsize=8.6, color=INK, linespacing=1.4)

    box(0, 21, "1. Read", f"the last {P['context']}\nletters, e.g.\n“…upon a ti”", PALE_BLUE, BLUE)
    box(26, 21, "2. Turn into\nnumbers", f"each letter becomes\na list of {P['width']}\nnumbers", "#f3f4f6", GREY)
    box(52, 21, f"3. {P['layers']} layers of\nlook back + think", "look back at earlier\nletters (attention),\nthen mix it all up", "#f3f4f6", GREY)
    box(78, 21, "4. Odds for the\nnext letter", f"{example}\n… for all {len(P['alphabet'])} letters", PALE_ORANGE, ORANGE)
    for x in (21.5, 47.5, 73.5):
        ax.annotate("", xy=(x + 4, 19), xytext=(x, 19), arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.5))
    ax.text(50, 36.5, "What happens inside the model when it makes one guess", ha="center", fontsize=12, weight="bold", color=INK)
    ax.text(50, 0, f"All of this is done with {P['parameters']:,} adjustable numbers. Practice nudges those numbers; nothing else changes.\n"
            f"Box 4 shows the trained model's real top 2 odds after “{P['guess_prompts'][0]}”.", ha="center", fontsize=8.6, color=INK)
    save(fig, "model.png")


def torn_picture(P, rows):
    start, end = math.exp(rows[0]["test_loss"]), math.exp(rows[-1]["test_loss"])
    fig, axes = plt.subplots(1, 4, figsize=(8.4, 3.6), gridspec_kw={"width_ratios": [1, 1, 1.5, 1]})
    items = [("a coin", 2, "heads or tails:\ntorn between 2"),
             ("a dice", 6, "1 to 6:\ntorn between 6"),
             ("our model,\nbefore practice", start, f"torn between\nabout {start:.0f} letters"),
             ("our model,\nafter practice", end, f"torn between\nabout {end:.1f} letters")]
    for ax, (name, n, label) in zip(axes, items):
        ax.axis("off"), ax.set_aspect("equal")
        k = math.ceil(n)
        cols = 2 if k <= 2 else 3 if k <= 6 else 12 if k > 40 else 4
        r = math.ceil(k / cols)
        ax.set_xlim(-0.2, max(cols, 3) + 0.2), ax.set_ylim(-3.2, 10.6)
        for i in range(k):
            rr, cc = divmod(i, cols)
            part = min(1.0, n - i)   # the last square is only partly filled for 3.8 and 93.2
            ax.add_patch(Rectangle((cc + 0.06, r - 1 - rr + 0.06), 0.88, 0.88, facecolor="white", edgecolor=ORANGE if "model" in name else BLUE, lw=1))
            ax.add_patch(Rectangle((cc + 0.06, r - 1 - rr + 0.06), 0.88 * part, 0.88, color=ORANGE if "model" in name else BLUE, alpha=0.75))
        ax.text(max(cols, 3) / 2, 9.4, name, ha="center", va="center", fontsize=10, weight="bold", color=INK)
        ax.text(max(cols, 3) / 2, -0.4, label, ha="center", va="top", fontsize=9.5, color=INK)
    fig.suptitle("“Torn between”: how many choices it is really stuck between (smaller is better)",
                 fontsize=11, weight="bold", color=INK, y=0.99)
    save(fig, "torn.png")


# ---------------------------------------------------------------------------
# Its guesses
# ---------------------------------------------------------------------------

def odds_axes(ax, odds, alphabet, real, k=10, ymax=1.0):
    best = sorted(range(len(odds)), key=lambda i: -odds[i])[:k]
    if real in alphabet and alphabet.index(real) not in best:   # always show the real letter, even when it is far down
        best[-1] = alphabet.index(real)
    xs = range(len(best))
    ax.bar(xs, [100 * odds[i] for i in best], color=[ORANGE if alphabet[i] == real else BLUE for i in best], width=0.75)
    ax.set_xticks(list(xs), [show(alphabet[i]) for i in best], family=MONO, fontsize=13)
    ax.set_ylim(0, 100 * ymax), ax.set_ylabel("odds (%)")
    for x, i in zip(xs, best):
        if odds[i] >= 0.01:
            ax.text(x, 100 * odds[i] + 1.5, f"{100 * odds[i]:.0f}%", ha="center", fontsize=8.5, color=INK)


def odds_animation(P):
    prompt, real = P["guess_prompts"][0], "m"
    frames, durations = [], []
    for snap in P["odds"]:
        odds = snap[prompt]
        fig, ax = plt.subplots(figsize=(6.4, 3.8))
        odds_axes(ax, odds, P["alphabet"], real)
        ax.set_title(f"“{prompt}…”  what comes next?\nAfter {snap['step']:,} practice steps: torn between about {torn_between(odds):.1f}",
                     fontsize=11, color=INK)
        ax.text(0.99, 0.95, "orange = the real next letter", transform=ax.transAxes, ha="right", fontsize=9, color=ORANGE)
        fig.tight_layout()
        frames.append(frame(fig)), durations.append(1800)
    durations[-1] = 3500
    save_gif(frames, durations, "odds.gif")


def odds_picture(P):
    reals = {P["guess_prompts"][0]: "m", P["guess_prompts"][1]: "e"}
    first, last = P["odds"][0], P["odds"][-1]
    fig, axes = plt.subplots(2, 2, figsize=(8, 5.6), sharey=True)
    for r, prompt in enumerate(P["guess_prompts"]):
        for c, snap in enumerate((first, last)):
            ax = axes[r][c]
            odds_axes(ax, snap[prompt], P["alphabet"], reals[prompt], k=8)
            ax.set_title(f"“{prompt}…”, after {snap['step']:,} steps\ntorn between about {torn_between(snap[prompt]):.1f}", fontsize=9.5, color=INK)
            if c:
                ax.set_ylabel("")
    fig.suptitle("Its odds for the next letter, before and after practice (orange = the real next letter)", fontsize=11, weight="bold", color=INK)
    fig.tight_layout()
    save(fig, "odds.png")


def sentence_row(ax, y, sentence, guesses, upto=None, size=10.5):
    """Draw sentence as tiles: green if the first guess was right, red if not, plain if not reached yet."""
    for i, ch in enumerate(sentence):
        if upto is not None and i > upto:
            tile(ax, i, y, None, face="white", edge="#e5e7eb", size=size)
            continue
        if upto is not None and i == upto:
            tile(ax, i, y, "?", face="#fef9c3", edge="#ca8a04", size=size, weight="bold")
            continue
        right = guesses[i]["top"][0][0] == ch
        tile(ax, i, y, ch, face=PALE_GREEN if right else PALE_RED, edge=GREEN if right else RED, size=size)


def read_along_animation(P):
    sentence, last = P["read_along_sentence"], P["read_along"][-1]
    guesses = last["guesses"]
    n = len(sentence)
    frames, durations = [], []
    for i in range(n + 1):
        fig = plt.figure(figsize=(8.6, 4.2))
        ax = fig.add_axes([0.02, 0.62, 0.96, 0.33])
        ax.set_xlim(-0.2, n + 0.2), ax.set_ylim(-0.6, 2.2), ax.axis("off")
        sentence_row(ax, 0, sentence, guesses, upto=i if i < n else None, size=9)
        done = guesses[:i]
        right = sum(g["top"][0][0] == g["real"] for g in done)
        ax.text(0, 1.6, f"A sentence from the hidden part of the book. First guess right so far: {right} of {len(done)}",
                fontsize=11, weight="bold", color=INK)
        bx = fig.add_axes([0.1, 0.14, 0.55, 0.38])
        if i < n:
            g = guesses[i]
            labels = [show(c) for c, _ in g["top"]]
            bx.barh(range(3)[::-1], [100 * p for _, p in g["top"]], color=[GREEN if c == g["real"] else BLUE for c, _ in g["top"]])
            bx.set_yticks(range(3)[::-1], labels, family=MONO, fontsize=14)
            bx.set_xlim(0, 100), bx.set_xlabel("odds (%)")
            for k, (_, p) in enumerate(g["top"]):
                bx.text(100 * p + 1, 2 - k, f"{100 * p:.0f}%", va="center", fontsize=9)
            bx.set_title("its top 3 guesses for the ? letter", fontsize=10, color=INK)
            verdict = "first guess right!" if g["top"][0][0] == g["real"] else "first guess wrong"
            fig.text(0.72, 0.32, f"real letter: '{show(g['real'])}'\n{verdict}\n(it gave the real letter\n{100 * g['real_odds']:.0f}% odds)",
                     fontsize=11, color=GREEN if g["top"][0][0] == g["real"] else RED, va="center")
        else:
            bx.axis("off")
            fig.text(0.1, 0.3, f"Done: its first guess was right for {right} of {n} letters.\n"
                     "Green = first guess right. Red = first guess wrong.", fontsize=12, color=INK)
        frames.append(frame(fig)), durations.append(900 if i < n else 4000)
    save_gif(frames, durations, "read-along.gif")


def read_along_picture(P):
    sentence = P["read_along_sentence"]
    n, snaps = len(sentence), P["read_along"]
    fig, ax = plt.subplots(figsize=(8.8, 0.62 * len(snaps) + 1.0))
    ax.set_xlim(-6.5, n + 0.2), ax.set_ylim(-0.4, 1.25 * len(snaps) + 0.5), ax.axis("off")
    for r, snap in enumerate(snaps):
        y = 1.25 * (len(snaps) - 1 - r)
        sentence_row(ax, y, sentence, snap["guesses"], size=8.5)
        right = sum(g["top"][0][0] == g["real"] for g in snap["guesses"])
        ax.text(-6.4, y + 0.45, f"{snap['step']:>5,} steps\n{right:>3} of {n}", va="center", fontsize=8.5, family=MONO, color=INK)
    ax.text(-6.4, 1.25 * len(snaps) + 0.2, "The same hidden sentence at each checkpoint. Green = first guess right, red = wrong.",
            fontsize=10.5, weight="bold", color=INK)
    save(fig, "read-along.png")


def first_guess_picture(rows):
    fig, axes = plt.subplots(1, len(rows), figsize=(8.4, 2.9))
    for ax, row in zip(axes, rows):
        right = round(100 * row["test_first_guess_right"])
        ax.set_xlim(0, 10), ax.set_ylim(-3.2, 11.6), ax.axis("off"), ax.set_aspect("equal")
        for k in range(100):
            r, c = divmod(k, 10)
            ax.add_patch(Rectangle((c + 0.08, 9 - r + 0.08), 0.84, 0.84, color=GREEN if k < right else "#e5e7eb"))
        ax.text(5, 10.8, f"after {row['step']:,} steps", ha="center", fontsize=9.5, weight="bold", color=INK)
        ax.text(5, -0.6, f"{right} of 100\nright", ha="center", va="top", fontsize=10, color=GREEN)
    fig.suptitle("Out of 100 guesses on the hidden part of the book, how many first guesses were right?",
                 fontsize=11, weight="bold", color=INK)
    save(fig, "first-guess.png")


# ---------------------------------------------------------------------------
# Its writing
# ---------------------------------------------------------------------------

def typewriter_animation(P):
    prompt, steps = P["prompt"], P["typewriter"]
    frames, durations = [], []
    written = ""
    for i, st in enumerate(steps + [None]):
        fig = plt.figure(figsize=(8, 4.4))
        tx = fig.add_axes([0.03, 0.55, 0.94, 0.42])
        tx.axis("off")
        tx.text(0, 1, "The trained model writes a story, one letter at a time", fontsize=12, weight="bold", color=INK, va="top")
        body = " " * len(prompt) + flat(written) + ("▌" if st else "")
        lines = "\n".join(body[k:k + 56] for k in range(0, len(body), 56))
        tx.text(0, 0.72, lines, fontsize=13, family=MONO, color=INK, va="top")
        tx.text(0, 0.72, prompt, fontsize=13, family=MONO, color=GREY, va="top")
        bx = fig.add_axes([0.12, 0.12, 0.5, 0.34])
        if st:
            letters = [show(c) for c, _ in st["top"]]
            bx.barh(range(5)[::-1], [100 * p for _, p in st["top"]], color=[ORANGE if c == st["picked"] else BLUE for c, _ in st["top"]])
            bx.set_yticks(range(5)[::-1], letters, family=MONO, fontsize=13)
            bx.set_xlim(0, 100), bx.set_xlabel("odds (%)")
            bx.set_title("its top 5 choices for the next letter", fontsize=10, color=INK)
            picked_rank = [c for c, _ in st["top"]].index(st["picked"]) + 1 if st["picked"] in [c for c, _ in st["top"]] else None
            note = "the most likely letter" if picked_rank == 1 else "not the most likely letter:\nlike rolling a weighted dice,\nless likely letters sometimes win" if picked_rank else "a rare letter outside the top 5"
            fig.text(0.67, 0.27, f"picked: '{show(st['picked'])}'\n{note}", fontsize=10.5, color=ORANGE, va="center")
            written += st["picked"]
        else:
            bx.axis("off")
        frames.append(frame(fig)), durations.append(450 if st else 4000)
    save_gif(frames, durations, "typewriter.gif")


def growing_animation(samples, rows):
    frames, durations = [], []
    for s, row in zip(samples, rows):
        fig = plt.figure(figsize=(8, 2.9))
        ax = fig.add_axes([0.03, 0.03, 0.94, 0.92])
        ax.axis("off")
        ax.text(0, 1, f"After {s['step']:,} practice steps", fontsize=15, weight="bold", color=BLUE, va="top")
        ax.text(0, 0.84, f"torn between about {math.exp(row['test_loss']):.1f} letters · first guess right "
                f"{100 * row['test_first_guess_right']:.0f} times in 100", fontsize=10, color=INK, va="top")
        ax.text(0, 0.66, "\n".join(textwrap.wrap(flat(s["story"])[:230], 62)), fontsize=11.5, family=MONO, color=INK, va="top")
        frames.append(frame(fig)), durations.append(3200)
    durations[-1] = 5000
    save_gif(frames, durations, "growing.gif")


def attention_picture(P):
    A = P["attention"]
    text, layers = A["text"], A["layers"]
    n = len(text)
    fig, ax = plt.subplots(figsize=(9, 0.75 * len(layers) + 2.1))
    ax.set_xlim(-4.2, n + 1.5), ax.set_ylim(-1.9, 1.15 * len(layers) + 1.4), ax.axis("off")
    cmap = plt.get_cmap("Oranges")
    for r, w in enumerate(layers):
        y = 1.15 * (len(layers) - 1 - r)
        biggest = max(w)
        for i, ch in enumerate(text):
            share = w[i] / biggest
            tile(ax, i, y, ch, face=cmap(0.05 + 0.85 * share), edge="#e5e7eb", size=9, color="white" if share > 0.65 else INK)
        tile(ax, n + 0.3, y, "?", face="#fef9c3", edge="#ca8a04", size=9, weight="bold")
        ax.text(-4.1, y + 0.45, f"layer {r + 1}", va="center", fontsize=9, color=INK)
    guess = ", ".join(f"'{show(c)}' {100 * p:.0f}%" for c, p in A["top"][:3])
    ax.text(-4.1, 1.15 * len(layers) + 0.6, "Guessing the ? letter: which earlier letters does each layer look back at most?",
            fontsize=11, weight="bold", color=INK)
    ax.text(-4.1, -0.5, f"Darker = looked at more (each row is scaled to its own biggest value). Its top guesses for ?: {guess}.",
            fontsize=9, color=INK, va="top")
    save(fig, "attention.png")


def dial_picture(P):
    dial = P["dial"]
    fig = plt.figure(figsize=(8.6, 5.2))
    fig.text(0.01, 0.99, "The same trained model, with the “adventure dial” turned to three settings", fontsize=12, weight="bold", color=INK, va="top")
    names = {0: "careful", 1: "normal", 2: "wild"}
    for k, d in enumerate(dial):
        y0 = 0.92 - (k + 1) * 0.3
        gx = fig.add_axes([0.01, y0 + 0.02, 0.17, 0.26])
        gx.set_xlim(-1.2, 1.2), gx.set_ylim(-0.5, 1.2), gx.axis("off"), gx.set_aspect("equal")
        for a0, col in ((120, GREEN), (60, "#ca8a04"), (0, RED)):
            gx.add_patch(Wedge((0, 0), 1, a0, a0 + 60, width=0.3, color=col, alpha=0.7))
        # needle: temperature 0.3 -> left, 1.5 -> right
        angle = math.radians(180 - 180 * min(1, d["temperature"] / 1.8))
        gx.annotate("", xy=(0.85 * math.cos(angle), 0.85 * math.sin(angle)), xytext=(0, 0), arrowprops=dict(arrowstyle="-|>", color=INK, lw=2))
        gx.text(0, -0.4, f"{names[k]}\n(temperature {d['temperature']})", ha="center", va="top", fontsize=9, color=INK)
        tx = fig.add_axes([0.21, y0 + 0.02, 0.77, 0.26])
        tx.axis("off")
        tx.text(0, 0.95, "\n".join(textwrap.wrap(flat(d["story"])[:190], 64)), fontsize=10, family=MONO, color=INK, va="top")
    save(fig, "dial.png")


def main():
    P = json.load(open("probes.json", encoding="utf-8"))
    samples = json.load(open("samples.json", encoding="utf-8"))
    with open("results.csv") as f:
        rows = [{k: (int(v) if k == "step" else float(v)) for k, v in r.items()} for r in csv.DictReader(f)]
    book = open("grimm.txt", encoding="utf-8").read()

    book_picture(P, book)
    alphabet_picture(P, book)
    practice_picture(P, book)
    model_picture(P)
    torn_picture(P, rows)
    odds_animation(P)
    odds_picture(P)
    read_along_animation(P)
    read_along_picture(P)
    first_guess_picture(rows)
    typewriter_animation(P)
    growing_animation(samples, rows)
    attention_picture(P)
    dial_picture(P)
    print("pictures done")


if __name__ == "__main__":
    main()
