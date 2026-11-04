---
title: "Can tidy dots help you find a circle’s secret number?"
subtitle: "A game in five short stages. Throw pretend darts, then race two teams to find pi."
date: 2026-11-01
summary: "We used pretend darts to guess pi, a number that belongs to every circle. Carefully spread darts gave closer guesses than random darts in our test. But one shape and one experiment cannot tell us what always works."
tags: [circles, pi, computer experiments, for young readers]
code: "experiment.py"
authors: [seawan]
ai:
  - name: "Claude"
    model: "claude-opus-5-5"
    role: "wrote the code, ran the experiment in a Delta sandbox, made the pictures, built the game and wrote this version of the post"
  - name: "ChatGPT (Codex CLI)"
    model: "gpt-6.1-sol"
    role: "rewrote an earlier version of the post for young readers"
contribution: "This is an AI vibe paper, made for children who are learning about AI. I asked for kid-friendly research posts and chose which topics to do. Claude wrote the code, ran the experiments in Delta cloud sandboxes, made the pictures and built the game. ChatGPT (Codex CLI) rewrote an earlier version for young readers. I then asked for the post to become a game in short stages, with less repetition, and Claude rewrote it."
license: CC-BY-4.0
code_license: MIT
author_verification:
  verified: true
  by: seawan
  date: 2026-11-04
  checked: "I played all five stages and read the whole post to make sure a child can follow it. I checked that the main numbers match the results file from the Delta run, and that the post has the Delta-reproducible badge and run record."
tldr:
  - "You can guess pi by counting dots inside a circle slice."
  - "Carefully spread dots gave closer guesses in our test."
  - "We tested one flat shape. Other puzzles may behave differently."
---

## The question

Can tidy dots help you find a circle's secret number? Play to find out. Your progress is kept on this device.

@interactive game.js#pi kit=lesson height=420 data=results.csv "The pi game, in five stages. The darts in Stages 2 and 3 are thrown by your browser. The race in Stage 4 shows our recorded results."

## What we did

Guessing with random dots is called a **Monte Carlo method** [@metropolis1949]. Team Halton uses a **Halton sequence**, a recipe of evenly spread points [@halton1960].

![Dart number 6: 6 in base 2 is 110, flipped it is 0.011, which is 0.375. 6 in base 3 is 20, flipped it is 0.02, which is 0.222.](flip-the-digits.svg "How the recipe places dart number 6. You can skip this and still follow the game. {diagram}")

We started with 64 darts and doubled up to just over a billion, playing 50 games at each size. Before each game we slid the Halton pattern by a random amount, with darts wrapping around the edges [@cranley1976]. We then compared each team's average miss.

> [!NOTE]
> **For grown-ups.** The largest sample contained {{result.max_darts}} darts per trial. The run took {{result.seconds}} seconds on an {{result.device}}. Errors are mean absolute errors across 50 trials: [`results.csv`](results.csv). Random sampling has a typical error proportional to $N^{-1/2}$; quasi-Monte Carlo uses evenly distributed points, and its guarantees depend on the integrand and point construction [@niederreiter1992]. The estimator is $\hat\pi_N = \frac{4}{N}\sum_{i=1}^{N}\mathbf{1}[x_i^2+y_i^2\le 1]$. This part of [`experiment.py`](experiment.py) checks each dart:
@include experiment.py#L57-L59

## Results

Team Halton had the smaller average miss at every size we tested, and its lead grew.

![Two squares, each with 256 dots. On the left the dots are random and clumpy. On the right they are spread evenly.](darts.png "Team Random (left) and Team Halton (right), 256 darts each. These two pictures happen to give the same guess, which is why we repeated the game.")

![A bar chart. With 64 darts, neat darts are 1.8 times more accurate. With 4,096 they are 6.6 times, with 262,144 they are 17 times, with about 17 million they are 68 times, and with about a billion they are 144 times more accurate.](race.png "How many times smaller Team Halton's average miss was.")

| Number of darts | Team Random's guess | Team Halton's guess |
|---:|---:|---:|
| 64 | {{result.guess_random_64}} | {{result.guess_halton_64}} |
| 262,144 | {{result.guess_random_262k}} | {{result.guess_halton_262k}} |
| about a billion | {{result.guess_random_1b}} | {{result.guess_halton_1b}} |
| **The real pi** | **{{result.pi_true}}** | **{{result.pi_true}}** |

These guesses are from a single game. At about a billion darts, Team Halton's average miss over 50 games was about {{result.better_by_1b}} times smaller.

> [!TAKEAWAY]
> Spreading the darts carefully gave much closer guesses in this experiment. The way you choose your dots can matter a lot!

![A chart with two falling lines. The random line falls gently. The neat line falls more steeply, but not as steeply as the dotted textbook line.](error.png "Average miss as we add darts. Each large step along a scale means ten times as much. The dotted orange line shows a faster pace that neat points can approach in suitable problems. Our game did not improve that quickly.")

> [!NOTE]
> **For grown-ups.** Fitted log-log slopes were {{result.slope_random}} for random sampling and {{result.slope_halton}} for shifted Halton sampling. He and Wang establish root-mean-square error rates of $O(N^{-1/2-1/(2d)})$ under particular assumptions and randomized constructions [@he2015]. In two dimensions this is $O(N^{-3/4})$. Our fitted slope is numerically close to that exponent, but we have not established that the theorem applies to this exact construction. We measured mean absolute error, not root-mean-square error, and a fitted slope is not a proof of a convergence rate.

## What this does and doesn't show

- **One shape on a flat square.** Other shapes, recipes and puzzles could behave differently.
- **A trend is a clue, not a rule forever.** Our lines describe only the sizes we tried.
- **Rounding.** We did not separately test whether tiny rounding effects changed the last few results.
- **The tricky edge.** Only darts near the curved edge can tip from inside to outside. We did not prove that this caused the pace we saw.
