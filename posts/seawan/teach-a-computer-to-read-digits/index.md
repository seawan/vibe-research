---
title: "Can a computer learn to read your numbers?"
subtitle: "A game in five short stages. Beat the computer at reading handwriting."
date: 2026-11-01
summary: "Can a computer learn to tell handwritten digits apart? We gave it examples, checked its guesses and looked closely at its mistakes. After practice, it got an average of {{result.final_accuracy_pct}}% right on pictures it never practised on."
tags: [AI, handwriting, learning from examples, for young readers]
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
  - "Can a computer learn handwriting by looking at examples?"
  - "After practice, it read {{result.final_accuracy_pct}}% correctly: about 124 mistakes in 10,000."
  - "It still mixed up shapes, and we did not test words or whole pages."
---

## The question

Can a computer learn to read handwritten digits just by looking at examples? Play to find out, and see if you can beat it. Your progress is kept on this device.

@interactive game.js#digits kit=lesson height=420 data=results.csv,examples.png,mistakes.png "The handwriting game, in five stages. The pictures, labels and scores come from our Delta run."

## What we did

A **neural network** learned from {{result.train_pictures}} labelled pictures of digits from a collection called **MNIST**, in {{result.epochs}} practice rounds. We tested it on {{result.test_pictures}} separate pictures it never practised on, and repeated all of this 3 times from different random starts.

> [!NOTE]
> **For grown-ups.** The network used convolutional layers to detect patterns, followed by layers that scored the possible digits. This approach builds on handwriting-recognition work by LeCun and colleagues [@lecun1998]. It had {{result.parameters}} adjustable parameters and used Adam to update them [@kingma2014]. All 3 runs took {{result.seconds}} seconds, including downloading the pictures, on an {{result.device}} graphics processor in a Delta cloud sandbox. The scores are in [results.csv](results.csv). The practice loop:
@include experiment.py#L121-L126

## Results

After practice, the networks read an average of **{{result.final_accuracy_pct}}% correctly**: about {{result.mistakes_per_10000}} mistakes in {{result.test_pictures}} pictures.

![A chart showing the percentage of correct test answers after each practice round for the 3 tries.](learning.png "Scores after each practice round. Watch the scale: it starts at 97%, which makes small changes look large.")

![A grid comparing the real digit in each row with the network's answer in each column. Darker squares show more frequent mistakes.](mixups.png "Read a row for the real digit and a column for the network's answer. Darker means that mix-up happened more often, added across all 3 tries.")

| The digit really was | The network said | Times across all 3 tries |
|---|---|---:|
| 5 | 3 | 23 |
| 2 | 1 | 20 |
| 9 | 4 | 17 |
| 4 | 9 | 16 |
| 9 | 7 | 16 |
| 2 | 7 | 14 |

> [!TAKEAWAY]
> Learning from examples helped this network read most of the test digits correctly. It still made about {{result.mistakes_per_10000}} mistakes in {{result.test_pictures}} pictures.

## What this does and doesn't show

- **Only tidy, single digits.** The pictures were centred and one size. We did not test envelopes, words or whole pages.
- **One design.** We tried this network from 3 starting points, not lots of designs.
- **Counts, not causes.** We can see which mix-ups happened, but not prove why, and we can't tell why two scores dipped in the last round.
- **Reading isn't understanding.** Matching a picture to a label says nothing about counting or adding.
