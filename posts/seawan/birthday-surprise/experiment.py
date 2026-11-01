"""
The birthday surprise: in a class of k kids, how likely is it that at least
two share a birthday?

We check it two ways:

  1. Simulation: make one million pretend classes of each size, give every
     kid a random birthday (365 days, all equally likely, no leap years),
     and count the classes with a shared birthday.
  2. Exact maths: 1 - (365/365) * (364/365) * ... * ((365-k+1)/365).

Outputs:
  results.csv     one row per class size: simulated chance, exact chance, difference
  chance.png      chance of a shared birthday vs. class size
  ten-classes.png ten simulated classes of 23 kids on calendar strips

The last line printed is a JSON summary of the headline numbers.

Run:
  python3 experiment.py
"""

import csv
import json
import time

import matplotlib
import numpy as np

matplotlib.use("Agg")  # draw to a file, no window needed
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

DAYS = 365
CLASS_SIZES = list(range(2, 81))   # classes of 2 up to 80 kids
CLASSES_PER_SIZE = 1_000_000       # pretend classes for each size
BATCH = 100_000                    # classes simulated at once (memory limit)
SEED = 2026


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

def exact_chance(k):
    """Exact chance that at least two of k kids share a birthday.

    Kid 1 can have any birthday, kid 2 must avoid 1 day, kid 3 must avoid 2,
    and so on. Multiply the 'all different' chances, then take 1 minus that.
    """
    all_different = np.prod([(DAYS - i) / DAYS for i in range(k)])
    return 1.0 - all_different


def classes_with_shared_birthday(rng, k, n):
    """Simulate n classes of k kids and count those with a shared birthday."""
    shared = 0
    for start in range(0, n, BATCH):
        size = min(BATCH, n - start)
        birthdays = np.sort(rng.integers(0, DAYS, size=(size, k)), axis=1)
        # after sorting, a shared birthday means two neighbours are equal
        shared += int((np.diff(birthdays, axis=1) == 0).any(axis=1).sum())
    return shared


def smallest_class_for(chance, rows):
    """Smallest class size whose exact chance reaches `chance`."""
    return next(r["class_size"] for r in rows if r["exact"] >= chance)


# ---------------------------------------------------------------------------
# Experiment
# ---------------------------------------------------------------------------

def run_experiment():
    rng = np.random.default_rng(SEED)
    rows = []
    for k in CLASS_SIZES:
        simulated = classes_with_shared_birthday(rng, k, CLASSES_PER_SIZE) / CLASSES_PER_SIZE
        exact = exact_chance(k)
        rows.append({"class_size": k, "simulated": simulated, "exact": exact, "difference": simulated - exact})
    return rows


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def save_csv(rows, path="results.csv"):
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        for row in rows:
            writer.writerow({k: (f"{v:.6g}" if isinstance(v, float) else v) for k, v in row.items()})


def save_chance_chart(rows, path="chance.png"):
    k = np.array([r["class_size"] for r in rows])
    sim = np.array([r["simulated"] for r in rows])
    exact = np.array([r["exact"] for r in rows])
    fig, ax = plt.subplots(figsize=(6.8, 4.2), dpi=160)
    ax.plot(k, 100 * exact, color="#111827", lw=1.5, label="exact maths")
    ax.plot(k, 100 * sim, "o", color="#c2410c", ms=3.5, label=f"simulation ({CLASSES_PER_SIZE:,} classes each)")
    ax.axhline(50, color="#6b7280", ls=":", lw=1)
    k50 = smallest_class_for(0.5, rows)
    ax.annotate(f"{k50} kids: just over 50%", xy=(k50, 100 * exact[k == k50][0]), xytext=(k50 + 8, 35),
                arrowprops=dict(arrowstyle="->", color="#374151"), fontsize=10)
    ax.set_xlabel("number of kids in the class")
    ax.set_ylabel("chance two share a birthday (%)")
    ax.set_ylim(0, 102)
    ax.grid(True, alpha=0.3)
    ax.legend(frameon=False, loc="lower right")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


def save_ten_classes(path="ten-classes.png", k=23, classes=10):
    """Ten pretend classes of k kids, each drawn as dots on a year-long strip."""
    rng = np.random.default_rng(7)  # its own generator: does not change results.csv
    fig, ax = plt.subplots(figsize=(7.4, 4.6), dpi=160)
    with_pair = 0
    for row in range(classes):
        birthdays = rng.integers(0, DAYS, size=k)
        values, counts = np.unique(birthdays, return_counts=True)
        shared = set(values[counts > 1])
        with_pair += bool(shared)
        y = classes - row
        ax.hlines(y, 0, DAYS - 1, color="#e5e7eb", lw=5)
        plain = [d for d in birthdays if d not in shared]
        ax.plot(plain, [y] * len(plain), "o", color="#2557a7", ms=4)
        if shared:
            ax.plot(sorted(shared), [y] * len(shared), "o", color="#c2410c", ms=10, mfc="none", mew=2)
        ax.text(DAYS + 8, y, "shared!" if shared else "", va="center", fontsize=9, color="#c2410c")
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    starts = np.cumsum([0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30])
    ax.set_xticks(starts + 15, months)
    ax.set_yticks(range(1, classes + 1), [f"class {classes - i}" for i in range(classes)])
    ax.set_xlim(-5, DAYS + 55)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.set_title(f"{classes} pretend classes of {k} kids: {with_pair} have a shared birthday (orange ring)", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")
    return with_pair


def main():
    began = time.time()
    rows = run_experiment()
    seconds = time.time() - began
    save_csv(rows)
    save_chance_chart(rows)
    classes_with_pair = save_ten_classes()

    print(f"{'kids':>5}  {'simulated':>9}  {'exact':>9}  {'difference':>10}")
    for r in rows:
        print(f"{r['class_size']:>5}  {r['simulated']:>9.4f}  {r['exact']:>9.4f}  {r['difference']:>+10.4f}")

    by_k = {r["class_size"]: r for r in rows}
    print(json.dumps({
        "classes_per_size": CLASSES_PER_SIZE,
        "seconds": round(seconds, 1),
        "kids_for_50pct": smallest_class_for(0.5, rows),
        "kids_for_99pct": smallest_class_for(0.99, rows),
        "simulated_23_pct": round(100 * by_k[23]["simulated"], 1),
        "exact_23_pct": round(100 * by_k[23]["exact"], 1),
        "simulated_30_pct": round(100 * by_k[30]["simulated"], 1),
        "simulated_50_pct": round(100 * by_k[50]["simulated"], 1),
        "simulated_70_pct": round(100 * by_k[70]["simulated"], 2),
        "largest_gap_pct": round(100 * max(abs(r["difference"]) for r in rows), 2),
        "pictured_classes_with_pair": classes_with_pair,
    }))


if __name__ == "__main__":
    main()
