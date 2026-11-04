---
title: "The birthday surprise: can your class find a match?"
subtitle: "A game in five short stages. How many kids does a class need?"
date: 2026-11-01
summary: "Play a birthday-matching game in five short stages, then see what a million pretend classes showed. Our results came very close to the answer worked out with maths."
tags: [probability, simulation, birthdays, for young readers]
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
  - "How many kids does a class need for a shared birthday to be as likely as a coin landing heads?"
  - "Fewer than most people guess. Play the game below to find out, and our computer games came very close to the maths answer."
  - "We gave every day the same chance and left out leap-day birthdays."
---

## The question

How many kids does a class need before two of them are as likely as not to share a birthday? Play to find out. Your progress is kept on this device.

@interactive game.js#birthday kit=lesson data=results.csv "The birthday game, in five stages. The pretend classes in Stage 3 are rolled by your browser. The rest uses our recorded results."

## What we did

A **simulation** is a pretend experiment on a computer. Ours made pretend classes, gave each kid a random birthday, and checked for a match. Every day of a 365-day year had the same chance. It played {{result.classes_per_size}} games for each class size from 2 to 80, and compared the results with the exact answer worked out with maths.

> [!NOTE]
> **For grown-ups.** The Python program is in [`experiment.py`](experiment.py), and the results are in [`results.csv`](results.csv). It ran in a Delta cloud sandbox in about {{result.seconds}} seconds. This excerpt checks for matching birthdays after sorting them.
@include experiment.py#L63-L65

## Results

![A line showing the chance of a shared birthday rising as classes get bigger. It reaches about half at 23 kids. Orange simulation dots sit very close to the black maths line.](chance.png "The chance of a match grows with class size. The orange simulation dots and the black exact-maths line are hard to tell apart.")

| Kids in the class | Simulation | Exact maths |
|---:|---:|---:|
| 10 | 11.71% | 11.69% |
| 23 | 50.66% | 50.73% |
| 30 | 70.66% | 70.63% |
| 50 | 97.03% | 97.04% |
| 70 | 99.92% | 99.92% |

> [!TAKEAWAY]
> With just 23 kids, a shared birthday is more likely than no shared birthday under our rules. The computer's games came very close to the exact maths.

## What this does and doesn't show

- **Real birthdays differ.** Some days are more common, twins share birthdays, and we left out 29 February. We did not measure real classes.
- **"Likely" is not a promise.** Your class is one game.
- **This was a check, not a discovery.** The maths was already known.
