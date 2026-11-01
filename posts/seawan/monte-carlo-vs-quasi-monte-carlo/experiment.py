"""
Estimate pi by dropping points into the unit square and counting how many
land inside the quarter circle x^2 + y^2 <= 1.

We compare two ways of choosing the points:

  1. Random points           (plain Monte Carlo, "MC")
  2. Evenly spread points    (Halton sequence with a random shift, "RQMC")

For each number of points N = 64, 128, ..., 2^30 (about a billion) we repeat
the estimate 50 times and record the average absolute error |estimate - pi|.
The points are made and counted on a GPU in chunks, so a billion points never
have to fit in memory at once. Without a GPU it falls back to the CPU (set
MAX_POWER=20 to keep that quick).

Outputs:
  results.csv   one row per N with the mean error and its spread for both methods
  error.png     log-log plot of error vs. N
  darts.png     256 random points next to 256 evenly spread points
  race.png      how many times more accurate the evenly spread points are, per N

The last line printed is a JSON summary of the headline numbers.

Run:
  python3 experiment.py
"""

import csv
import json
import os
import platform
import time

import matplotlib
import numpy as np
import torch

matplotlib.use("Agg")  # draw to a file, no window needed
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

MAX_POWER = int(os.environ.get("MAX_POWER", 30))     # largest N is 2^MAX_POWER
POINT_COUNTS = [2**k for k in range(6, MAX_POWER + 1)]
NUM_SEEDS = 50                                       # repetitions per N (gives error bars)
CHUNK = 2**24                                        # points handled at once (memory limit)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

def inside_circle(x, y):
    """True for each point inside the quarter circle (distance from the corner <= 1)."""
    return x * x + y * y <= 1.0


def van_der_corput(start, n, base):
    """Numbers start+1 .. start+n of the van der Corput sequence in the given base.

    Recipe for the i-th number: write i in `base`, then mirror its digits
    around the decimal point. Example in base 2: i = 6 = 110 -> 0.011 = 0.375.
    The result fills [0, 1) evenly instead of randomly.
    """
    index = torch.arange(start + 1, start + n + 1, device=DEVICE, dtype=torch.int64)
    result = torch.zeros(n, device=DEVICE, dtype=torch.float64)
    digit_weight = 1.0 / base     # value of the first digit after the point
    while bool((index > 0).any()):
        result += digit_weight * (index % base)
        index //= base            # drop the digit we just used
        digit_weight /= base      # the next digit is worth `base` times less
    return result


def halton_points(start, n):
    """Points start+1 .. start+n of the 2-D Halton sequence: base 2 for x, base 3 for y."""
    return van_der_corput(start, n, 2), van_der_corput(start, n, 3)


def random_shift(x, y, shift):
    """Move every point by the same random offset and wrap around the square.

    This is the Cranley-Patterson rotation: the points stay evenly spread,
    but the estimate becomes random and unbiased, so we can measure its error.
    """
    return (x + shift[0]) % 1.0, (y + shift[1]) % 1.0


def counts_at_checkpoints(inside, start, checkpoints):
    """How many points are inside after each checkpoint N that falls in this chunk.

    `inside` covers points start+1 .. start+len(inside). Returns {N: count within chunk}.
    """
    running = torch.cumsum(inside, dim=0, dtype=torch.int64)
    return {n: int(running[n - start - 1]) for n in checkpoints if start < n <= start + len(inside)}


# ---------------------------------------------------------------------------
# Experiment
# ---------------------------------------------------------------------------

def run_experiment():
    """Return one dict per N with mean/std of |estimate - pi| for both methods."""
    total = max(POINT_COUNTS)
    # One random-number stream per repetition, plus that repetition's Halton shift
    streams = [torch.Generator(device=DEVICE).manual_seed(seed) for seed in range(NUM_SEEDS)]
    shifts = [torch.rand(2, generator=g, device=DEVICE, dtype=torch.float64) for g in streams]
    mc_inside = np.zeros((NUM_SEEDS, len(POINT_COUNTS)), dtype=np.int64)
    rqmc_inside = np.zeros_like(mc_inside)
    mc_total = np.zeros(NUM_SEEDS, dtype=np.int64)
    rqmc_total = np.zeros(NUM_SEEDS, dtype=np.int64)

    for start in range(0, total, CHUNK):
        n = min(CHUNK, total - start)
        hx, hy = halton_points(start, n)  # the same Halton points serve every repetition
        for seed, g in enumerate(streams):
            # 1. Random points
            x = torch.rand(n, generator=g, device=DEVICE, dtype=torch.float64)
            y = torch.rand(n, generator=g, device=DEVICE, dtype=torch.float64)
            inside = inside_circle(x, y)
            for col, c in _by_column(counts_at_checkpoints(inside, start, POINT_COUNTS)):
                mc_inside[seed, col] = mc_total[seed] + c
            mc_total[seed] += int(inside.sum())

            # 2. Evenly spread points, randomly shifted
            sx, sy = random_shift(hx, hy, shifts[seed])
            inside = inside_circle(sx, sy)
            for col, c in _by_column(counts_at_checkpoints(inside, start, POINT_COUNTS)):
                rqmc_inside[seed, col] = rqmc_total[seed] + c
            rqmc_total[seed] += int(inside.sum())

    rows = []
    for col, n in enumerate(POINT_COUNTS):
        mc_err = np.abs(4.0 * mc_inside[:, col] / n - np.pi)
        rqmc_err = np.abs(4.0 * rqmc_inside[:, col] / n - np.pi)
        rows.append({
            "n": n,
            "mc_mean_abs_err": mc_err.mean(),
            "mc_std": mc_err.std(),
            "rqmc_mean_abs_err": rqmc_err.mean(),
            "rqmc_std": rqmc_err.std(),
        })
    return rows


def _by_column(found):
    """Turn {N: count} into (column index, count) pairs for the results table."""
    return ((POINT_COUNTS.index(n), c) for n, c in found.items())


def fitted_slope(n, err):
    """Slope of log(error) vs. log(N): -0.5 means error ~ N^-0.5, -1 means ~ N^-1."""
    return np.polyfit(np.log(n), np.log(err), 1)[0]


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def save_csv(rows, path="results.csv"):
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        for row in rows:
            writer.writerow({k: (f"{v:.6g}" if isinstance(v, float) else v) for k, v in row.items()})


def save_plot(n, mc, rqmc, slope_mc, slope_rqmc, path="error.png"):
    fig, ax = plt.subplots(figsize=(6.4, 4.2), dpi=160)
    ax.loglog(n, mc, "o-", color="#2557a7", ms=4, label=f"Random points (slope {slope_mc:.2f})")
    ax.loglog(n, rqmc, "s-", color="#c2410c", ms=4, label=f"Shifted Halton points (slope {slope_rqmc:.2f})")
    # Dotted guide lines with the textbook rates, starting from the first data point
    ax.loglog(n, mc[0] * np.sqrt(n[0] / n), ":", color="#2557a7", alpha=0.6, label=r"$\propto N^{-1/2}$")
    ax.loglog(n, rqmc[0] * (n[0] / n), ":", color="#c2410c", alpha=0.6, label=r"$\propto N^{-1}$")
    ax.set_xlabel("number of points $N$")
    ax.set_ylabel(rf"mean $|\hat\pi - \pi|$ over {NUM_SEEDS} tries")
    ax.grid(True, which="major", alpha=0.3)
    ax.legend(frameon=False, fontsize=9)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


def save_darts_picture(n=256, path="darts.png"):
    """Draw n random points next to n evenly spread (Halton) points."""
    rng = np.random.default_rng(2026)  # its own generator: does not change results.csv
    hx, hy = (t.cpu().numpy() for t in halton_points(0, n))
    pictures = [("Random darts", rng.random(n), rng.random(n), "#2557a7"),
                ("Evenly spread darts", hx, hy, "#c2410c")]
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 4.2), dpi=160, layout="constrained")
    t = np.linspace(0, np.pi / 2, 200)
    for ax, (title, x, y, color) in zip(axes, pictures):
        inside = x * x + y * y <= 1.0
        ax.scatter(x[inside], y[inside], s=10, color=color)
        ax.scatter(x[~inside], y[~inside], s=10, facecolors="none", edgecolors=color)
        ax.plot(np.cos(t), np.sin(t), color="black", lw=1.5)
        ax.set(xlim=(0, 1), ylim=(0, 1), aspect="equal", xticks=[], yticks=[])
        ax.set_title(f"{title}\n{inside.sum()} of {n} inside, so π ≈ {4 * inside.mean():.3f}", fontsize=10)
    fig.savefig(path, facecolor="white")


def save_race_chart(rows, path="race.png"):
    """Bar chart: how many times smaller the evenly spread error is, for a few N."""
    picks = [r for r in rows if r["n"] in (64, 4096, 262144, 16777216, 1073741824)]
    labels = [f"{r['n']:,}" for r in picks]
    ratios = [r["mc_mean_abs_err"] / r["rqmc_mean_abs_err"] for r in picks]
    fig, ax = plt.subplots(figsize=(6.8, 3.8), dpi=160)
    bars = ax.bar(labels, ratios, color="#c2410c")
    ax.bar_label(bars, labels=[f"{v:.0f}x" if v >= 10 else f"{v:.1f}x" for v in ratios], padding=3)
    ax.set_xlabel("number of darts")
    ax.set_ylabel("times more accurate")
    ax.set_ylim(0, max(ratios) * 1.2)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


def main():
    began = time.time()
    rows = run_experiment()
    seconds = time.time() - began
    save_csv(rows)

    n = np.array([r["n"] for r in rows])
    mc = np.array([r["mc_mean_abs_err"] for r in rows])
    rqmc = np.array([r["rqmc_mean_abs_err"] for r in rows])
    slope_mc, slope_rqmc = fitted_slope(n, mc), fitted_slope(n, rqmc)

    print(f"device: {torch.cuda.get_device_name(0) if DEVICE == 'cuda' else platform.processor() or 'cpu'}")
    print(f"fitted slope   random: {slope_mc:.3f}   halton: {slope_rqmc:.3f}   ({seconds:.0f} s)")
    print(f"{'N':>12}  {'random err':>10}  {'halton err':>10}  {'halton better by':>16}")
    for r in rows:
        ratio = r["mc_mean_abs_err"] / r["rqmc_mean_abs_err"]
        print(f"{r['n']:>12}  {r['mc_mean_abs_err']:>10.2e}  {r['rqmc_mean_abs_err']:>10.2e}  {ratio:>15.1f}x")

    save_plot(n, mc, rqmc, slope_mc, slope_rqmc)
    save_darts_picture()
    save_race_chart(rows)

    # Final line: machine-readable summary (kept by Delta as result_summary)
    by_n = {r["n"]: r for r in rows}
    summary = {
        "device": torch.cuda.get_device_name(0) if DEVICE == "cuda" else "cpu",
        "max_darts": int(n[-1]),
        "seconds": round(seconds, 1),
        "slope_random": round(float(slope_mc), 2),
        "slope_halton": round(float(slope_rqmc), 2),
    }
    for label, size in (("262k", 2**18), ("1b", 2**30)):
        if size in by_n:
            r = by_n[size]
            summary[f"random_error_{label}"] = float(f"{r['mc_mean_abs_err']:.2g}")
            summary[f"halton_error_{label}"] = float(f"{r['rqmc_mean_abs_err']:.2g}")
            summary[f"better_by_{label}"] = round(float(r["mc_mean_abs_err"] / r["rqmc_mean_abs_err"]), 1)
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
