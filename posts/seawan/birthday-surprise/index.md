---
title: "The birthday surprise: why 23 kids are enough"
subtitle: "In a class of 23, it's a coin flip whether two kids share a birthday. We checked by simulating millions of pretend classes."
date: 2026-11-01
summary: "We made a million pretend classes of every size from 2 to 80 kids and counted how often two kids share a birthday. With just 23 kids it happens about half the time, matching the exact maths almost perfectly."
tags: [probability, simulation, birthday paradox, for young readers]
code: "experiment.py"
authors: [seawan]
ai:
  - name: "Claude"
    model: "claude-opus-5-5"
    role: "wrote the code, ran the experiment in a Delta sandbox, made the pictures and wrote the post"
contribution: "This is an AI vibe paper, made for children who are learning about AI. I asked for kid-friendly research posts and chose which topics to do. Claude wrote the code, ran the experiments in Delta cloud sandboxes, made the pictures and wrote the text."
license: CC-BY-4.0
code_license: MIT
author_verification:
  verified: true
  by: seawan
  date: 2026-11-01
  checked: "I read the whole post and looked at every picture to make sure a child can follow it. I checked that the main numbers in the text match the results file from the Delta run, and that the post has the Delta-reproducible badge and run record."
tldr:
  - "How many kids does a class need before it's likely that two of them share a birthday? Most people guess around 180."
  - "We simulated 1,000,000 pretend classes of each size. With **23 kids**, {{result.simulated_23_pct}}% of classes had a shared birthday. The exact maths says {{result.exact_23_pct}}%."
  - "We assumed all 365 days are equally likely and ignored leap days. Real birthdays are not spread perfectly evenly, which makes a shared birthday a tiny bit more likely, not less."
---

## The question

Think of your class at school. What are the chances that two people in it have the same birthday?

There are 365 days in a year, so it feels like you'd need lots of people, maybe 180 or so, before a match becomes likely. The real answer surprises almost everyone: **23 people is enough for about a 50–50 chance.** With 70 people, it's practically certain.

This is called the **birthday paradox**. It isn't really a paradox (nothing is impossible about it), it's just very surprising. We wanted to check it for ourselves, not by trusting a formula, but by actually trying it millions of times.

## Why it happens

The trick is that we're not asking "does someone share **my** birthday?" We're asking "do **any two** people share a birthday?" Those are very different questions.

> [!INTUITION]
> In a class of 23, there are **253 different pairs** of kids (each of the 23 can pair with 22 others, and we halve that so we don't count each pair twice: 23 × 22 ÷ 2 = 253). Each pair is a separate chance for a match. 253 small chances add up fast!

Here is another way to think about it. Line the kids up and let them say their birthday one by one:

- The 1st kid can have any birthday.
- The 2nd kid must avoid 1 day to keep everyone different: a 364 out of 365 chance.
- The 3rd kid must avoid 2 days: 363 out of 365.
- …and so on, until the 23rd kid must avoid 22 days: 343 out of 365.

Each step is very likely on its own. But to have **no** shared birthday, every single step must go right. Multiply all those chances together and you get about 0.49. So the chance of at least one shared birthday is 1 − 0.49, about 0.51.

> [!NOTE]
> **For grown-ups.** For $k$ people and 365 equally likely days, the chance that everyone's birthday is different is $\prod_{i=0}^{k-1}\frac{365-i}{365}$, so the chance of at least one shared birthday is
> $$P(k) = 1 - \prod_{i=0}^{k-1}\frac{365-i}{365}.$$
> In words: multiply the "still all different" chances for each new person, then take 1 minus that.

## What we did

We wrote a short Python program, [`experiment.py`](experiment.py), that makes pretend classes:

1. **Class sizes.** Every size from 2 kids to 80 kids.
2. **Lots of classes.** For each size we made {{result.classes_per_size}} pretend classes.
3. **Random birthdays.** Every pretend kid gets a random day from 1 to 365, each day equally likely.
4. **Look for a match.** Sort the birthdays in each class. If two neighbours in the sorted list are the same, that class has a shared birthday.

That check takes just two lines:

@include experiment.py#L63-L65

5. **Compare with the maths.** For each class size we also worked out the exact answer with the formula above.

The program ran on a [Delta](#reproduce) sandbox with 2 CPU cores and took about {{result.seconds}} seconds. All the numbers are in [`results.csv`](results.csv).

## Results

First, here are 10 pretend classes of 23 kids, each drawn as dots on a calendar. An orange ring marks a day where two kids share a birthday.

![Ten rows of dots on a January-to-December strip, one row per pretend class of 23 kids. Several rows have an orange ring marking a shared birthday.](ten-classes.png "Ten pretend classes of 23 kids. In {{result.pictured_classes_with_pair}} of these 10 classes, two kids share a birthday. Ten is too few to measure the chance, but it shows how often a match turns up.")

Now the full experiment, with a million classes for every size:

![A curve rising from 0% at 2 kids to almost 100% at 60 kids. It passes 50% at 23 kids. Orange dots from the simulation sit right on the black line from the exact formula.](chance.png "Chance that at least two kids share a birthday, by class size. The orange dots are our simulation and the black line is the exact maths. They agree so closely that you can hardly tell them apart.")

| Kids in the class | Classes with a shared birthday (simulated) |
|---:|---:|
| 23 | {{result.simulated_23_pct}}% |
| 30 | {{result.simulated_30_pct}}% |
| 50 | {{result.simulated_50_pct}}% |
| 70 | {{result.simulated_70_pct}}% |

> [!TAKEAWAY]
> With just {{result.kids_for_50pct}} kids, a shared birthday is more likely than not. With {{result.kids_for_99pct}} kids, it's 99% certain.

What to notice:

1. **The surprise is real.** At 23 kids our simulation found a match in {{result.simulated_23_pct}}% of classes, and the formula says {{result.exact_23_pct}}%.
2. **Simulation and maths agree.** Across all 79 class sizes, the simulation was never more than {{result.largest_gap_pct}} percentage points away from the exact answer. That small wobble is just the luck of the draw: with a million tries, we expect differences of about a tenth of a percentage point.
3. **The curve shoots up, then flattens.** Going from 10 to 30 kids raises the chance from about 12% to about 71%. After 60 kids there is hardly anywhere left to go.

## What this does (and doesn't) show

- **Real birthdays aren't perfectly even.** More babies are born in some months than others, and fewer on some holidays. When some days are more popular, matches become a little **more** likely, so the real chance is, if anything, slightly higher than our numbers. We did not test this.
- **We ignored 29 February.** Adding leap days would make matches a tiny bit less likely, but the effect is very small.
- **Twins break the rules.** A class with twins in it is guaranteed a match! Our pretend kids all have independent birthdays.
- **The simulation only confirms the formula.** It's a good check that we understood the maths, not a new discovery: mathematicians worked this out long ago.
