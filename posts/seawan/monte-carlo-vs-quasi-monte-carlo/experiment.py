"""
Estimate pi by dropping points into the unit square and counting how many
land inside the quarter circle x^2 + y^2 <= 1.

We compare two ways of choosing the points:

  1. Random points           (plain Monte Carlo, "MC")
  2. Evenly spread points    (Halton sequence with a random shift, "RQMC")

For each number of points N we repeat the estimate with 50 different random
seeds and record the average absolute error |estimate - pi|.

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

import matplotlib
import numpy as np

matplotlib.use("Agg")  # draw to a file, no window needed
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

POINT_COUNTS = [2**k for k in range(6, 19)]  # N = 64, 128, ..., 262,144
NUM_SEEDS = 50                               # repetitions per N (gives error bars)


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

def estimate_pi(x, y):
    """Fraction of points inside the quarter circle, times 4.

    The quarter circle has area pi/4 inside the unit square, so
    (points inside) / (all points) is roughly pi/4.
    """
    inside = x * x + y * y <= 1.0
    return 4.0 * np.mean(inside)


def van_der_corput(n, base):
    """First n numbers of the van der Corput sequence in the given base.

    Recipe for the i-th number: write i in `base`, then mirror its digits
    around the decimal point. Example in base 2: i = 6 = 110 -> 0.011 = 0.375.
    The result fills [0, 1) evenly instead of randomly.
    """
    index = np.arange(1, n + 1)  # we start at i = 1 (i = 0 would give the point 0)
    result = np.zeros(n)
    digit_weight = 1.0 / base    # value of the first digit after the point
    while np.any(index > 0):
        last_digit = index % base
        result += digit_weight * last_digit
        index //= base           # drop the digit we just used
        digit_weight /= base     # the next digit is worth `base` times less
    return result


def halton_points(n):
    """First n points of the 2-D Halton sequence: base 2 for x, base 3 for y."""
    return van_der_corput(n, 2), van_der_corput(n, 3)


def random_shift(x, y, shift):
    """Move every point by the same random offset and wrap around the square.

    This is the Cranley-Patterson rotation: the points stay evenly spread,
    but the estimate becomes random and unbiased, so we can measure its error.
    """
    return (x + shift[0]) % 1.0, (y + shift[1]) % 1.0


# ---------------------------------------------------------------------------
# Experiment
# ---------------------------------------------------------------------------

def run_experiment():
    """Return one dict per N with mean/std of |estimate - pi| for both methods."""
    # Halton points are deterministic, so compute them once and reuse prefixes.
    halton_x, halton_y = halton_points(max(POINT_COUNTS))

    rows = []
    for n in POINT_COUNTS:
        mc_errors, rqmc_errors = [], []
        for seed in range(NUM_SEEDS):
            rng = np.random.default_rng(seed)

            # 1. Random points
            x, y = rng.random(n), rng.random(n)
            mc_errors.append(abs(estimate_pi(x, y) - np.pi))

            # 2. Evenly spread points, randomly shifted
            shift = rng.random(2)
            hx, hy = random_shift(halton_x[:n], halton_y[:n], shift)
            rqmc_errors.append(abs(estimate_pi(hx, hy) - np.pi))

        rows.append({
            "n": n,
            "mc_mean_abs_err": np.mean(mc_errors),
            "mc_std": np.std(mc_errors),
            "rqmc_mean_abs_err": np.mean(rqmc_errors),
            "rqmc_std": np.std(rqmc_errors),
        })
    return rows


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
    ax.loglog(n, mc, "o-", color="#2557a7", label=f"Random points (slope {slope_mc:.2f})")
    ax.loglog(n, rqmc, "s-", color="#c2410c", label=f"Shifted Halton points (slope {slope_rqmc:.2f})")
    # Dotted guide lines with the textbook rates, starting from the first data point
    ax.loglog(n, mc[0] * np.sqrt(n[0] / n), ":", color="#2557a7", alpha=0.6, label=r"$\propto N^{-1/2}$")
    ax.loglog(n, rqmc[0] * (n[0] / n), ":", color="#c2410c", alpha=0.6, label=r"$\propto N^{-1}$")
    ax.set_xlabel("number of points $N$")
    ax.set_ylabel(r"mean $|\hat\pi - \pi|$ over 50 seeds")
    ax.grid(True, which="major", alpha=0.3)
    ax.legend(frameon=False, fontsize=9)
    fig.tight_layout()
    fig.savefig(path)


def save_darts_picture(n=256, path="darts.png"):
    """Draw n random points next to n evenly spread (Halton) points."""
    rng = np.random.default_rng(2026)  # its own generator: does not change results.csv
    pictures = [("Random darts", rng.random(n), rng.random(n), "#2557a7"),
                ("Evenly spread darts", *halton_points(n), "#c2410c")]
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
    picks = [r for r in rows if r["n"] in (64, 1024, 16384, 262144)]
    labels = [f"{r['n']:,}" for r in picks]
    ratios = [r["mc_mean_abs_err"] / r["rqmc_mean_abs_err"] for r in picks]
    fig, ax = plt.subplots(figsize=(6.4, 3.6), dpi=160)
    bars = ax.bar(labels, ratios, color="#c2410c")
    ax.bar_label(bars, labels=[f"{v:.1f}x" for v in ratios], padding=3)
    ax.set_xlabel("number of darts")
    ax.set_ylabel("times more accurate")
    ax.set_ylim(0, max(ratios) * 1.2)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")


def main():
    rows = run_experiment()
    save_csv(rows)

    n = np.array([r["n"] for r in rows])
    mc = np.array([r["mc_mean_abs_err"] for r in rows])
    rqmc = np.array([r["rqmc_mean_abs_err"] for r in rows])
    slope_mc, slope_rqmc = fitted_slope(n, mc), fitted_slope(n, rqmc)

    print(f"fitted slope   random: {slope_mc:.3f}   halton: {slope_rqmc:.3f}")
    print(f"{'N':>8}  {'random err':>10}  {'halton err':>10}  {'halton better by':>16}")
    for r in rows:
        ratio = r["mc_mean_abs_err"] / r["rqmc_mean_abs_err"]
        print(f"{r['n']:>8}  {r['mc_mean_abs_err']:>10.2e}  {r['rqmc_mean_abs_err']:>10.2e}  {ratio:>15.1f}x")

    save_plot(n, mc, rqmc, slope_mc, slope_rqmc)
    save_darts_picture()
    save_race_chart(rows)

    # Final line: machine-readable summary (kept by Delta as result_summary)
    last = rows[-1]
    print(json.dumps({
        "slope_random": round(float(slope_mc), 2),
        "slope_halton": round(float(slope_rqmc), 2),
        "random_error_262k": float(f"{last['mc_mean_abs_err']:.2g}"),
        "halton_error_262k": float(f"{last['rqmc_mean_abs_err']:.2g}"),
        "better_by_262k": round(float(last["mc_mean_abs_err"] / last["rqmc_mean_abs_err"]), 1),
    }))


if __name__ == "__main__":
    main()
