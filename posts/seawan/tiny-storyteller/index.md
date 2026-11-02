---
title: "Can a tiny computer learn to tell a fairy tale?"
subtitle: "We gave a little text-guessing program a book of fairy tales. Watch its writing change as it practises."
date: 2026-11-01
summary: "Can a computer get better at guessing the next letter in a book? Our tiny storyteller went from jumbled letters to writing that sounds like a fairy tale. But its stories still don't quite make sense."
tags: [AI, fairy tales, guessing games, for young readers]
code: "experiment.py"
draft: true
authors: [seawan]
ai:
  - name: "Claude"
    model: "claude-opus-5-5"
    role: "wrote the code, ran the experiment in a Delta sandbox, made the pictures and wrote the post"
  - name: "ChatGPT (Codex CLI)"
    model: "gpt-6.1-sol"
    role: "rewrote the post for young readers"
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
  - "Our tiny storyteller plays a game: guess the next letter."
  - "After practice, its guesses improved and its writing sounded more like fairy tales."
  - "Better guesses did not give it stories that made sense."
---

## The question

Can a computer get better at guessing the next letter just by practising with a book?

Try the game yourself. Read this:

> Once upon a ti

Which letter comes next? You probably picked “m”. After that, you would probably pick “e”.

**The right answer is the actual next letter in the book.** We want to find out whether a computer gets better at guessing that letter.

A **language model** is a program that guesses the next bit of text. Our little model guesses a letter at a time. It also guesses spaces and marks such as commas. We will call it our tiny storyteller.

The scientist Claude Shannon tried a next-letter guessing game with people, too [@shannon1951]. We tried it with a computer and a book of fairy tales.

### What does “torn between” mean?

Imagine seeing just the letter “t”. Many letters could follow it. You might feel **torn between** several choices: unsure which to pick.

With “Once upon a ti”, you have a much stronger clue. You are probably much less torn.

We use a score to describe the model's uncertainty. Scientists call it **perplexity**. We will call it the “letters torn between” score. A lower score means better guesses about the real next letters.

Here are our comparison points:

- A model that knows nothing and gives every choice an equal chance would score **{{result.alphabet_size}}**. That is every letter and symbol in this book.
- A perfect model would score **1**. It would always give all its chance to the correct next letter.

The score is a way to sum up many guesses. It is not a count of letters on a list inside the computer.

## What we did

### Give the storyteller some practice

For a computer, **practice**, also called **training**, means making guesses and adjusting numbers inside the program using the right answers. It does not mean trying hard or thinking like you.

We used [Grimms' Fairy Tales](grimm.txt). The storyteller practised on the earlier part of the book. We saved the ending for a test. It never practised on that part.

A **practice step** is a round of guesses and adjustments. Each round includes lots of next-letter guesses. We ran {{result.steps}} steps.

The program picked passages by chance. That is what **random** means here. Think of rolling a die to choose a move in a game. You do not choose which face lands on top.

### Let it look back for clues

Our storyteller uses a design called a **transformer**. This design has a way to give some earlier bits of text more weight when making a guess. That is called **attention** [@vaswani2017].

Think about guessing the next letter after “Once upon a ti”. The letters “ti” are useful clues. Attention helps the program use clues from earlier text. It does not mean the computer is paying attention the way you do.

### Ask it to write

We gave the storyteller this beginning:

> Once upon a time

Then it chose a next letter. We added that letter and asked again.

Its choices have different chances. We call those chances **odds**. When it writes, the program picks letters using those odds. A more likely letter has a better chance of being picked. This lets the storyteller write different passages from the same beginning.

> [!NOTE]
> **For grown-ups.** The model had {{result.parameters}} adjustable parameters and practised on {{result.training_letters}} characters. It ran on a graphics processing unit, or GPU—a chip that can do many calculations at once—in a Delta cloud sandbox, a separate online computing space. The GPU was an {{result.device}}. The run took {{result.seconds}} seconds.

> [!NOTE]
> **For grown-ups.** The following excerpt from [`experiment.py`](experiment.py) shows how the program chooses and adds the next character.

@include experiment.py#L129-L133

## Results

### What did it write?

![Four short passages that each begin with "Once upon a time". The first is random letters, the second has word-like chunks, the third has real words, and the fourth reads like a fairy tale that does not quite make sense.](samples.png "What the storyteller wrote after 0, 300, 1,000 and {{result.steps}} practice steps, each time starting from \"Once upon a time\".")

Here is another sample, after 100 practice steps. The strange spellings are exactly what it wrote:

> Once upon a timer ad the foun tour llore the oust wind he ont f mor hend spin ter, lsPr the thilothithawber we heokereir t he st, f inthad ind owhe w a Tono asom wowim, w he cies!’ rand fand ble th he he fo wen ce wethithes hed hengan.

What changed along the way:

- **After 0 steps:** it writes a jumble of letters, numbers and symbols.
- **After 100 steps:** spaces and little words such as “the” and “he” appear. Much of the passage is still made up.
- **After 300 steps:** more real words appear, along with commas and quotation marks.
- **After 1,000 and {{result.steps}} steps:** the samples sound more like fairy tales. They include speech, such as ‘I will’ and ‘Don the man!’ replied…. But the sentences still do not quite make sense.

These samples show changes in its writing. They do not tell us exactly when it picked up each pattern.

### Did its guesses get closer to the right answer?

Remember: the right answer for each guess is **the real next letter in the book**. The perfect score is **1**.

Here are the scores at our stopping points. Smaller is better.

| Practice steps | Text it never saw | Text it practised on | Perfect score |
|---|---:|---:|---:|
| 0 | 93.2 | 93.3 | 1 |
| 100 | 10.1 | 9.9 | 1 |
| 300 | 5.7 | 5.5 | 1 |
| 1,000 | 4.0 | 3.4 | 1 |
| 2,000 | 3.8 | 2.9 | 1 |

Our “knows nothing” comparison scores {{result.alphabet_size}}. The storyteller began even worse than that comparison. Giving a wrong letter too much chance can hurt its score.

By the end, its score on unseen text was about **3.8**. That is much better than its starting score of **93.2**, but it is still above the perfect score of **1**.

![A chart with two falling lines: one for text the model learned from and one for text it never saw. Both fall from about 90 to under 4.](learning.png "How many letters the model is torn between when guessing, on text it practised on (blue) and text it never saw (orange). Lower is better.")

The score improved on the hidden pages, too. That is evidence it picked up patterns useful beyond its practice passages.

It did better on pages it had practised on. That could partly come from remembering those pages. The gap alone does not tell us how much it remembered.

> [!TAKEAWAY]
> Practice helped our tiny storyteller guess letters on unseen pages. Its writing also sounded more like fairy tales. But better letter guesses did not turn it into a storyteller whose tales made sense.

## What this does and doesn't show

**It picked up useful patterns.** Its guesses improved on text it had never practised on. It did more than simply repeat the sample passages shown here.

**We have not shown that it understands stories.** Familiar words and story-like speech are not enough to prove understanding. Characters can appear and vanish without a sensible reason.

**It is tiny compared with real chatbots.** We used a small program and a single book. This experiment shows how practice can improve next-letter guesses. It does not show how well a full chatbot works.

**It guesses letters.** Chatbots usually guess pieces of text that may be whole words or parts of words. Those pieces are called **tokens**. Our letters make the guessing game easier to see.

**We tried this once.** A different start could produce different writing and scores. We did not run it again to check.

**Its book uses old-fashioned English.** That helps explain why its writing sounds like an old fairy tale. We have not shown how well it would write about your school day—or anything else outside that book.