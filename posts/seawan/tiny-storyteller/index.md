---
title: "A tiny storyteller: watching an AI learn to write"
subtitle: "We built a very small version of the kind of AI behind chatbots, gave it Grimms' Fairy Tales to read, and watched its writing go from gibberish to almost-stories."
date: 2026-11-01
summary: "We trained a tiny language model, with about {{result.parameters}} adjustable numbers, to write like Grimms' Fairy Tales one letter at a time. In a few minutes of practice it went from random letters to fairy-tale-sounding sentences that don't quite make sense."
tags: [machine learning, language models, transformers, for young readers]
code: "experiment.py"
draft: true
authors: [seawan]
ai:
  - name: "Claude"
    model: "claude-opus-5-5"
    role: "wrote the code, ran the experiment in a Delta sandbox, made the pictures and wrote the post"
contribution: ""  # TO FILL IN BY THE AUTHOR, in your own words: what you did and what the AI did
license: CC-BY-4.0
code_license: MIT
# Only the author fills this in, after checking the results personally.
author_verification:
  verified: false
  by: ""
  date: ""
  checked: ""
tldr:
  - "AI chatbots write by guessing the next bit of text, over and over. We built a tiny model that guesses the next **letter**, trained it on Grimms' Fairy Tales, and watched what it wrote as it learned."
  - "At the start it was torn between about {{result.torn_between_start}} letters for every guess. After {{result.steps}} practice steps it was torn between only about **{{result.torn_between_end}}**, and its writing went from gibberish to fairy-tale-sounding sentences."
  - "Its stories still don't make sense. It is about a hundred thousand times smaller than real chatbots and read only one book, so this shows **how** they learn, not how good they are."
---

## The question

When you chat with an AI like Claude or ChatGPT, it can feel like magic. But underneath, these programs do something surprisingly simple: **they guess what comes next**, over and over again.

A famous scientist, Claude Shannon, played a game like this in 1951. He showed people the start of a sentence and asked them to guess the next letter [@shannon1951]. People are good at it, because they know words and stories. Could a computer learn to play the same game, just by reading?

We wanted to see this with our own eyes. So we built a **tiny storyteller**, gave it a book of fairy tales, and watched how its writing changed as it learned.

## How a computer can learn to write

Our storyteller only ever does one thing: **look at the last 128 letters, and guess the next one.**

> [!INTUITION]
> Imagine reading "Once upon a ti". What comes next? Almost certainly "m". Then "Once upon a tim" is followed by "e". You can guess because you've read lots of stories. Our storyteller learns the same way: it reads the book again and again, makes guesses, and gets nudged every time it is wrong.

To write a story, we give it a start, "Once upon a time", and let it guess one letter. We add that letter to the end and ask for the next one, and so on. It's like a game of consequences where the same player keeps adding a letter.

Its guesses come with odds, for example "m: 95%, n: 3%, anything else: 2%". When it writes, we pick letters according to those odds, so its stories come out a little different every time.

The model is a **transformer**, the same design used by today's chatbots [@vaswani2017]. Its special trick is called **attention**: when it guesses a letter, it can look back and decide which earlier letters matter most. It has {{result.parameters}} adjustable numbers inside it. That sounds like a lot, but real chatbots have hundreds of billions.

## What we did

1. **The book.** We used [Grimms' Fairy Tales](grimm.txt), a public-domain book of about half a million letters, with stories like Hansel and Gretel and Rumpelstiltskin. The model practised on the first 90% of the book. We kept the last 10% hidden, to test it on writing it had never seen.
2. **The practice.** In each step, the model read 64 random stretches of 128 letters from the book, guessed every next letter, and was nudged towards the right answers. We did {{result.steps}} steps.
3. **Checkpoints.** At a few points during practice we stopped and measured how "surprised" it was by the hidden part of the book, and asked it to continue "Once upon a time".
4. **Where it ran.** In a Delta cloud sandbox with 4 ordinary computer processors (CPUs). A model this small doesn't need a graphics card. The whole thing took {{result.seconds}} seconds.

Here is how a story gets written, one letter at a time, from [`experiment.py`](experiment.py):

@include experiment.py#L129-L133

In words: ask the model for its odds for the next letter, pick one according to those odds, stick it on the end, repeat.

## Results

### Its writing, as it learned

![Four short passages that each begin with "Once upon a time". The first is random letters, the second has word-like chunks, the third has real words, and the fourth reads like a fairy tale that does not quite make sense.](samples.png "What the storyteller wrote after 0, 300, 1,000 and {{result.steps}} practice steps, each time starting from \"Once upon a time\".")

STORY-SAMPLES-PLACEHOLDER

### How surprised it is by new text

We measured how many letters the model was "torn between" for each guess on the hidden part of the book. (Scientists call this the *perplexity*.) A model that knew nothing would be torn between all {{result.alphabet_size}} different letters and symbols in the book. A perfect model would be torn between just 1.

![A chart with two falling lines: one for text the model learned from and one for text it never saw. Both fall from about 80 to under 4.](learning.png "How many letters the model is torn between when guessing, on text it practised on (blue) and text it never saw (orange). Lower is better.")

> [!TAKEAWAY]
> By reading one book and guessing the next letter {{result.steps}} times, a tiny model went from being torn between about {{result.torn_between_start}} letters to about {{result.torn_between_end}}, and learned spelling, words and the feel of a fairy tale on its own.

What to notice:

1. **It learns in stages.** First it learns which letters are common, then spaces and short words, then longer words and punctuation, then the style of the book.
2. **It never learned the meaning.** Its stories sound like fairy tales, but characters appear and vanish and nothing really happens. Getting meaning needs much bigger models and much more reading.
3. **New text vs. practice text.** The two lines stay close together, so the model learned general patterns of the book, not just memorised the pages it practised on.

## What this does (and doesn't) show

- **Tiny compared to real chatbots.** Ours has about {{result.parameters}} numbers and read one book. Real chatbots have hundreds of billions of numbers, read a large part of the internet and books, and get extra training to be helpful and safe. This shows *how* they learn, not how good they are.
- **Letters, not words.** Real chatbots guess chunks of words called *tokens*, not single letters. We used letters because they are easier to see and understand.
- **One run.** We trained once with one random start. Another run would write different stories, though we expect a similar "torn between" score. We did not test that.
- **Old-fashioned English.** The book is a translation from the 1800s, so the model writes in that style.
