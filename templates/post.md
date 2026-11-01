---
title: "{{title}}"
subtitle: ""            # one sentence: the question, in plain words
date: {{date}}
summary: ""             # 1–2 sentences for the index page and RSS
tags: []
code: ""                # link to code/data (repo, gist, notebook)
draft: true             # remove when ready to publish
tldr:
  - "What we asked."
  - "What we found (with the key number)."
  - "Why it matters / what it does not show."
---

## The question

What are we trying to find out, and why should a non-specialist care? One or two short paragraphs, no symbols.

## Background in plain words

> [!INTUITION]
> The everyday-language version of the key idea, ideally with an analogy.

Now the precise version. Introduce every symbol before using it, then follow each important equation with what it says in words.

$$
\text{(key equation)}
$$

In words: …

Prior work: who has looked at this before [@key].

## What we did

The method / experiment design, step by step. Enough detail to reproduce: data, model, hyperparameters, number of seeds, hardware, runtime.

## Results

![Short alt text](figure.png "What the figure shows and the one thing to notice.")

| Setting | Metric | ± std |
|---|---|---|
| … | … | … |

> [!TAKEAWAY]
> The one-sentence result.

## What this does (and doesn't) show

Limitations, threats to validity, things we did not test.

## Reproduce it

```bash
# commands to re-run the experiments
```
