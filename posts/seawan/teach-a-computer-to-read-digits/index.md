---
title: "Can a computer learn to read your numbers?"
subtitle: "We gave a computer lots of handwriting to practise on. Then we checked its answers on pictures kept out of practice."
date: 2026-11-01
summary: "Can a computer learn to tell handwritten digits apart? We gave it examples, checked its guesses and looked closely at its mistakes. After practice, it got an average of {{result.final_accuracy_pct}}% right on pictures it never practised on."
tags: [AI, handwriting, learning from examples, for young readers]
code: "experiment.py"
authors: [seawan]
ai:
  - name: "Claude"
    model: "claude-opus-5-5"
    role: "wrote the code, ran the experiment in a Delta sandbox, made the pictures and wrote the post"
  - name: "ChatGPT (Codex CLI)"
    model: "gpt-6.1-sol"
    role: "rewrote the post for young readers"
contribution: "This is an AI vibe paper, made for children who are learning about AI. I asked for kid-friendly research posts and chose which topics to do. Claude wrote the code, ran the experiments in Delta cloud sandboxes, made the pictures and wrote the text."
license: CC-BY-4.0
code_license: MIT
author_verification:
  verified: true
  by: seawan
  date: 2026-11-01
  checked: "I read the whole post and looked at every picture to make sure a child can follow it. I checked that the main numbers in the text match the results file from the Delta run, and that the post has the Delta-reproducible badge and run record."
tldr:
  - "Can a computer learn handwriting by looking at examples?"
  - "After practice, it read {{result.final_accuracy_pct}}% correctly: about 124 mistakes in 10,000."
  - "It still mixed up shapes, and we did not test words or whole pages."
---

## The question

Write a 7. Now ask someone else to write one.

Do they look the same? Perhaps yours has a cross through the middle. Perhaps theirs has a curly top. You can probably read both.

A **digit** is a single written sign for a number, such as 3 or 7. Our question was: **can a computer learn to read handwritten digits by looking at examples?**

Here is the game. Show the computer a picture of a digit. Ask it which digit it sees. Check its answer.

The **right answer** is the digit named by the picture's label. If the label says 5 and the computer says 3, that counts as a mistake.

### A team of shape spotters

Imagine a team solving a picture puzzle. Some teammates look for curves. Others look for corners. They pass along clues, and the team picks an answer.

A **neural network** is a computer program that works a little like that team. Connected parts help turn a picture into a guess. We will call it the network.

For a computer, **training**, or **practice**, means using examples with known answers to change how the program makes guesses. It does not mean the computer is trying hard or thinking like you.

Our network has adjustable settings, like knobs. During practice, it guesses, checks the label and adjusts those settings to help it give better answers.

Learning from examples this way is called **machine learning**.

## What we did

### First, give it pictures

A **pixel** is one tiny square in a computer picture. Lots of pixels together make the strokes and spaces you see.

We used a collection of handwritten digit pictures called **MNIST**. Each picture has a label giving the right answer.

The network had {{result.train_pictures}} pictures for practice. Here are some:

![Sixteen small black-and-white pictures of handwritten digits, with the correct digit shown above each.](examples.png "Try covering the labels and guessing the digits yourself. Notice how differently people write the same digit.")

### Then, practise and check

One trip through all the practice pictures is called an **epoch**. Think of it as a practice round. Each network completed {{result.epochs}} rounds.

We kept another {{result.test_pictures}} pictures apart. This separate collection is called the **test set**.

The network never practises on the test set. Those pictures do not guide its adjustments. That lets us check whether it can read examples beyond the ones used for practice.

It is like practising spelling with one list, then being checked on a different list.

After each round, we measured **accuracy**: how many pictures out of 100 the network reads correctly. A percentage is a way to say “out of 100.”

### Try it again

The network's starting settings involve **random** choices. Random means chance helps decide what happens, like rolling dice or tossing a coin.

Different starts might lead to different results. So we ran 3 separate tries and compared them.

> [!NOTE]
> **For grown-ups.** The network used convolutional layers to detect patterns, followed by layers that scored the possible digits. This approach builds on handwriting-recognition work by LeCun and colleagues [@lecun1998]. It had {{result.parameters}} adjustable parameters and used Adam to update them [@kingma2014].
>
> The practice loop is included below.

@include experiment.py#L121-L126

> [!NOTE]
> **For grown-ups.** All 3 runs together took {{result.seconds}} seconds, including downloading the pictures, on an {{result.device}} graphics processor in a Delta cloud sandbox. The recorded scores are in [results.csv](results.csv), and the code is in [experiment.py](experiment.py).

## Results

After the first practice round, the networks read an average of {{result.accuracy_after_1_epoch_pct}}% correctly.

After the last round, the average was **{{result.final_accuracy_pct}}% correct**.

What does that mean for {{result.test_pictures}} pictures? **About {{result.mistakes_per_10000}} answers were wrong.** That is an average across the 3 tries, so each try did not make exactly the same number of mistakes.

Here is how the tries changed during practice. Every score is a percentage: higher means more correct answers.

| Practice round | Try 1 | Try 2 | Try 3 |
|---|---:|---:|---:|
| 1 | 97.61% | 97.21% | 97.46% |
| 2 | 98.30% | 97.90% | 98.20% |
| 3 | 98.68% | 98.50% | 98.80% |
| 4 | 98.98% | 98.69% | 98.69% |
| 5 | 98.87% | 98.50% | 98.91% |

![A chart showing the percentage of correct test answers after each practice round for the 3 tries.](learning.png "All 3 tries improved overall. Watch the scale: it starts at 97%, which makes small changes look large.")

Two tries got slightly worse after the last round. The other improved. More practice did not improve every score.

We cannot tell from these results alone why the scores dipped. The networks might have become too used to the practice pictures. Or these might just be small ups and downs.

> [!TAKEAWAY]
> Learning from examples helped this network read most of the test digits correctly. It still made about {{result.mistakes_per_10000}} mistakes in 10,000 pictures.

### Compare the guesses with the truth

Now for the detective work. Where did it go wrong?

In the next picture, **“is” gives the right answer from the label**. **“said” gives the network's answer**. These are mistakes from the first try.

Look at each pair. Can you see a shape that might have led to the wrong guess?

![Sixteen digits the first network misread, each marked with the right answer, “is,” and the network's guess, “said.”](mistakes.png "Compare “is” with “said” above each picture. Every pair shows a wrong guess. Some handwriting looks unusual or hard to read.")

Some of these pictures look tricky. But looking at a few mistakes cannot tell us the cause of every wrong answer.

### Which digits got mixed up?

The next picture groups the mistakes from all 3 tries.

Read a row to find **what the digit really was**. Read a column to find **what the network said**. A darker square means that mix-up happened more often.

![A grid comparing the real digit in each row with the network's answer in each column. Darker squares show more frequent mistakes.](mixups.png "Mistakes added together across all 3 tries. Empty squares mean that particular mix-up never happened.")

Here are the listed mix-ups in words, so you can compare truth and guess directly:

| What the digit really was | What the network said | Times across all 3 tries |
|---|---|---:|
| 5 | 3 | 23 |
| 2 | 1 | 20 |
| 9 | 4 | 17 |
| 4 | 9 | 16 |
| 9 | 7 | 16 |
| 2 | 7 | 14 |

The most common mix-up was a real **5** read as **3**. It happened **23 times across the 3 tries**.

Shared curves or strokes might help explain some mistakes. The counts tell us which mix-ups happened, but they do not prove why.

## What this tells us—and what it leaves open

The network did well on this collection of separate digit pictures. The pictures were already placed near the centre and made the same size.

We did not test scribbles on an envelope, whole pages or words. These results do not tell us how well it would read those.

We also did not compare lots of different network designs. We tried this design from 3 starting points.

And reading a digit is different from understanding a number. This game checked whether the network could match a picture to a label. It did not check counting, adding or knowing which number is bigger.

You can try the picture game yourself. Cover the labels, make your guesses, then uncover the answers. Which shapes fooled you?