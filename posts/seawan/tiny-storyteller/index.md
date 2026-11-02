---
title: "A tiny storyteller: how a computer learns to write, one letter at a time"
subtitle: "We gave a small AI a book of fairy tales and a guessing game. Watch, in pictures and animations, how its guesses sharpen and its stories grow."
date: 2026-11-01
summary: "We built a tiny version of the kind of AI behind chatbots and let it practise one guessing game: what is the next letter? After practice, its first guess was right about 60 times in 100 on pages it had never seen, and its writing went from jumbled symbols to fairy-tale-sounding sentences that still don't make sense."
tags: [AI, language models, fairy tales, guessing games, for young readers]
code: "experiment.py"
authors: [seawan]
ai:
  - name: "Claude"
    model: "claude-opus-5-5"
    role: "wrote the code, ran the experiment in a Delta sandbox, made the pictures and animations, and wrote this version of the post"
  - name: "ChatGPT (Codex CLI)"
    model: "gpt-6.1-sol"
    role: "rewrote an earlier version of the post for young readers"
contribution: "This is an AI vibe paper, made for children who are learning about AI. I asked for kid-friendly research posts, chose which topics to do, and asked for this post to explain the setting in detail with lots of pictures and animations. Claude wrote the code, ran the experiment in a Delta cloud sandbox, made the pictures and animations, and wrote the text, building on an earlier rewrite by ChatGPT (Codex CLI)."
license: CC-BY-4.0
code_license: MIT
author_verification:
  verified: true
  by: seawan
  date: 2026-11-02
  checked: "I read the whole post and looked at every picture to make sure a child can follow it. I checked that the story samples and the numbers in the table match the results files from the Delta run, and that the post has the Delta-reproducible badge and run record."
tldr:
  - "Our tiny storyteller plays one game, again and again: guess the next letter."
  - "After practice on one book, its first guess was right about 60 times in 100 on pages it had never seen."
  - "Its stories sound like fairy tales but don't make sense: good guessing is not the same as understanding."
---

## The question

Try this. What letter comes next?

> Once upon a ti_

You probably said **m**, to make "time". You knew because you have heard lots of stories.

AI chatbots like Claude and ChatGPT do something surprisingly similar. Underneath, they play one simple game, over and over: **guess what comes next**. A scientist called Claude Shannon played this game with people in 1951. He showed them the start of a sentence and asked them to guess the next letter [@shannon1951].

So here is our question: **if a computer only ever plays this guessing game with one book, can it learn to write like that book?**

To find out, we built a tiny storyteller. We gave it a book of fairy tales and let it practise the game. Then we watched how its guesses and its writing changed.

## What we did

This section explains the whole setting, step by step. Each step has a picture.

### Step 1: the book

Our storyteller learned from one book: [Grimms' Fairy Tales](grimm.txt). It has stories like *Hansel and Gretel* and *Rumpelstiltskin*. Its first English translation is about 200 years old, so anyone may copy it.

To the computer, the book is not pages and chapters. It is **one very long line of letters**.

![A long bar, mostly blue with a small orange part at the end. The blue part is the practice part with 468,736 letters. The orange part is the hidden part with 52,082 letters. Below, a zoomed-in strip shows the start of the book as single letter tiles, with spaces and line breaks shown as small signs.](book.png "The book as one long line of letters. The model practises only on the blue part. We hide the orange part and use it later, to test the model on writing it has never seen.")

We cut the line into two parts:

- **The practice part** (the first 90%). The model learns from this part.
- **The hidden part** (the last 10%). The model never learns from this part. We use it like a surprise test.

> [!INTUITION]
> Imagine practising your spelling with one list of words, and then being tested on a different list. If you do well on the new list, you have learned how spelling works, not just memorised your practice list. That is why we keep part of the book hidden.

### Step 2: what counts as a "letter"

For our storyteller, a "letter" means **any single symbol** in the book. That includes capital letters, small letters, spaces, commas, quotation marks and even line breaks. The book uses {{result.alphabet_size}} different symbols in all.

![81 small tiles, each showing one symbol from the book. The space and the letter e are the darkest, meaning most common. Rare symbols like digits, brackets and ä are pale.](alphabet.png "Every 'letter' the storyteller can choose from, most common first. Darker means more common in the book. A space is the most common of all.")

Every time the model makes a guess, it must choose one of these {{result.alphabet_size}} tiles.

### Step 3: the guessing game

The game is always the same:

1. The model reads some letters of the book.
2. It guesses the **next** letter.
3. We check its guess against **the real next letter in the book**. That real letter is the right answer.

The model does not give just one guess. It gives **odds** for every possible letter. Odds tell you how likely it thinks each choice is. For example, after "Once upon a ti", a good guesser might say: "m: 95%, n: 2%, anything else: 3%". The odds for all the letters always add up to 100%.

### Step 4: inside the model

A model that guesses the next bit of text is called a **language model**. Ours is a kind called a **transformer**, the same kind used in today's chatbots [@vaswani2017].

![Four boxes joined by arrows. Box 1: read the last 128 letters. Box 2: turn each letter into a list of 192 numbers. Box 3: 4 layers of look back and think. Box 4: odds for the next letter, for all 81 letters.](model.png "What happens inside the model each time it makes a guess. Box 4 shows the trained model's real top two odds after “Once upon a ti”.")

Here is what the boxes mean:

- **It can look back 128 letters.** That is about two lines of a book. Anything further back, it cannot see.
- **Letters become numbers.** Computers only work with numbers, so each letter is turned into a list of numbers.
- **Look back and think.** In each layer, the model looks back at the earlier letters and decides which ones matter most for this guess. This looking back is called **attention**. Then it mixes everything together. It does this 4 times.
- **Odds come out.** At the end, it gives odds for every one of the {{result.alphabet_size}} letters.

All of this is done with {{result.parameters}} numbers inside the model. Think of them as {{result.parameters}} tiny knobs. When the model is brand new, the knobs are set at random, so its guesses are rubbish.

### Step 5: practice

**Practice** (scientists call it **training**) means turning those knobs a tiny bit, again and again, so that the right answers get higher odds. The computer is not "trying hard" or thinking like you. It is just adjusting numbers.

Here is one round of practice, which we call a **practice step**:

![Top: the practice part of the book as a long pale bar, with 64 blue pins showing where the 64 stretches start, spread across the whole book. Bottom: a zoom on the first 16 letters of one stretch. A row of blue tiles shows the letters the model reads, and below it a row of orange tiles shows the same letters moved along by one, which are the letters it must guess.](practice.png "The real first practice step. The model reads 64 stretches of 128 letters from random places in the book. Every letter in a stretch is a guessing question: the answer is simply the letter that comes next.")

In each practice step:

1. The computer picks 64 random places in the practice part of the book.
2. From each place, it takes a stretch of 128 letters.
3. Every letter in every stretch is a guessing question. That makes 64 × 128 = 8,192 questions in one step!
4. It checks all its guesses against the real letters.
5. It turns the knobs a tiny bit, so the real letters would have got higher odds.

We did **{{result.steps}} practice steps**. That is more than 16 million guessing questions.

> [!EXAMPLE]
> It is like a spelling quiz where, after every quiz, you change your memory just a tiny bit towards the right answers. One quiz doesn't change much. Two thousand quizzes change a lot.

### Step 6: checking on the hidden part

At five moments during practice we stopped and checked the model. These moments are called **checkpoints**: after 0 steps (brand new), 100, 300, 1,000 and {{result.steps}} steps.

At each checkpoint we did three things, always on the **hidden** part of the book:

- We counted how often its **first guess** (the letter with the highest odds) was right.
- We measured how many letters it was **torn between** (explained in the next step).
- We asked it to write a story starting with "Once upon a time".

### Step 7: how we score it

The easiest score is the **first guess**. Out of 100 guesses, how many times did the letter it thought most likely turn out to be the real letter?

The second score needs a little explaining. It is called **"torn between"**. (Scientists call it **perplexity**.)

![Four groups of squares. A coin: 2 squares. A dice: 6 squares. Our model before practice: about 93 squares. Our model after practice: about 4 squares.](torn.png "“Torn between” counts how many choices it is really stuck between. A coin is torn between 2. A dice is torn between 6. Smaller is better.")

> [!INTUITION]
> If you flip a coin, you are torn between 2 answers: heads or tails. If you roll a dice, you are torn between 6. If you knew the answer for sure, you would be torn between just 1.
>
> Our score asks: on average, how many letters is the model *really* stuck between when it guesses? A model that knew nothing would be torn between all {{result.alphabet_size}} letters. A perfect model would be torn between 1.

### Where it ran

The model practised on a **GPU**, a computer chip that can do many sums at once, in a Delta cloud sandbox: a computer far away that we borrowed for a few minutes.

> [!NOTE]
> **For grown-ups.** A 4-layer, 4-head, width-192 character-level transformer with {{result.parameters}} parameters, trained for {{result.steps}} steps of AdamW (batch 64, context 128, cosine learning rate from 1e-3) on {{result.training_letters}} training characters. Perplexity is $e^{\text{loss}}$, with the cross-entropy loss measured in nats per character on random test batches. The run, including all the probes and pictures, took {{result.seconds}} seconds on an {{result.device}}. Code: [`experiment.py`](experiment.py) (training and probes) and [`pictures.py`](pictures.py) (pictures and animations). Data: [`results.csv`](results.csv), [`samples.json`](samples.json), [`probes.json`](probes.json). The writing loop:

@include experiment.py#L147-L151

## Results

### 1. Watch one guess get sharper

Let's start with a single question: what comes after "Once upon a ti"? The animation shows the model's odds at each checkpoint. The orange bar is the right answer, **m**.

![An animated bar chart. At 0 steps all bars are tiny and m has about 1%. At 100 steps n is the tallest bar. At 300 steps l and m are tallest. At 1,000 and 2,000 steps m towers above the rest at 95%.](odds.gif "Animation: its odds for the letter after “Once upon a ti”, at each checkpoint. Orange is the real next letter.")

- **Brand new (0 steps):** the odds are spread almost evenly. It gave **m** only about 1%. It was torn between about 73 letters.
- **After 100 steps:** it had learned which letters are common, but not this word. Its top guess was **n**, and **m** got only 7%.
- **After 300 steps:** **m** rose to 22%, but **l** was still ahead with 44%.
- **After 1,000 steps and after {{result.steps}} steps:** it gave **m** 95%. It was torn between only about 1.3 letters.

Here is the same idea for a second beginning, "The king and the qu", where the real next letter is **e** (to make "queen"):

![Four bar charts. Top left: Once upon a ti, after 0 steps, flat bars, m at 1%. Top right: after 2,000 steps, m at 95%. Bottom left: The king and the qu, after 0 steps, flat bars. Bottom right: after 2,000 steps, e at 87%.](odds.png "Before practice (left) and after {{result.steps}} steps (right), for two beginnings. Orange is the real next letter.")

For "The king and the qu", its odds for **e** grew from under 1% to 87%. It had learned that in fairy tales a "qu" after "the king and the" is very often a queen.

### 2. Reading along with a hidden sentence

Now a whole sentence. This one comes from the **hidden** part of the book, so the model never practised on it:

> Once upon a time the king held a great feast,

We let the trained model guess each letter, one at a time, looking at all the letters before it. **Green** means its first guess was right. **Red** means it was wrong.

![An animation that moves along the sentence one letter at a time. For each letter it shows the model's top 3 guesses as bars, then marks the letter green or red.](read-along.gif "Animation: the trained model reading along with a sentence it has never seen, guessing each letter before it is shown.")

Here is the same sentence at every checkpoint:

![Five rows of the same sentence in letter tiles, one row per checkpoint. The first row is almost all red. Each later row has more green tiles.](read-along.png "The same hidden sentence at each checkpoint. Green = first guess right, red = wrong. The counts on the left say how many of the 45 letters it got right first time.")

Count the green tiles:

| Practice steps | First guess right (out of 45 letters) |
|---:|---:|
| 0 | 1 |
| 100 | 14 |
| 300 | 23 |
| 1,000 | 30 |
| {{result.steps}} | 30 |

Look at where it goes wrong. It can't know that the sentence starts with "O" rather than "T". It can't know the next word will be "king" or "feast". But once a word has started, like "fe", it often guesses the rest. This is just like you: guessing the next word in a story is hard, but finishing a word is easy.

### 3. The scores for the whole hidden part

One sentence could be lucky or unlucky. So we also scored the model on lots of random stretches of the hidden part.

![Five grids of 100 squares, one per checkpoint, with green squares showing how many first guesses out of 100 were right: 1, 32, 48, 58 and 60.](first-guess.png "Out of 100 guesses on the hidden part, how many first guesses were right, at each checkpoint.")

Its first guess was right only about **1 time in 100** when brand new, about as good as guessing at random. After {{result.steps}} steps, it was right about **60 times in 100** ({{result.first_guess_right_end_pct}}%, to be exact).

Here are the "torn between" scores. Remember: smaller is better, and a perfect model would score 1.

| Practice steps | Torn between: hidden part | Torn between: practice part | Perfect score |
|---:|---:|---:|---:|
| 0 | 93.2 | 93.3 | 1 |
| 100 | 10.1 | 9.9 | 1 |
| 300 | 5.7 | 5.5 | 1 |
| 1,000 | 4.0 | 3.4 | 1 |
| {{result.steps}} | 3.8 | 2.9 | 1 |

![A chart with two falling lines: one for text the model learned from and one for text it never saw. Both drop steeply from about 93 to about 10 in the first 100 steps, then slowly to under 4.](learning.png "“Torn between” as practice goes on, on the practice part (blue) and the hidden part (orange). Lower is better.")

Three things to notice:

1. **Most of the learning happens early.** The biggest drop is in the first 100 steps. After that, it improves more slowly.
2. **It starts out worse than "knows nothing".** A brand-new model is torn between about 93 letters, even though there are only {{result.alphabet_size}}. That is because its random knobs make it confidently wrong about some letters, which is worse than evenly unsure.
3. **The hidden part is a little harder than the practice part.** By the end, it is torn between about 2.9 letters on pages it practised on, but about 3.8 on hidden pages. That small gap means it has started to memorise its practice pages a little.

### 4. Watching it write

To write a story, we give the model a beginning, "Once upon a time". It gives odds for the next letter. The computer **picks** a letter using those odds, a bit like spinning a spinner with bigger slices for likelier letters. We stick that letter on the end and ask again. Over and over.

![An animation of text being typed one letter at a time after Once upon a time. Under the text, a bar chart shows the model's top 5 choices for the next letter, with the picked letter in orange.](typewriter.gif "Animation: the trained model writing a story, one letter at a time. The bars show its top 5 choices for each letter; orange is the letter that was picked.")

Watch the orange bar. Usually the picked letter is the most likely one. But not always: in this story, 16 of the 60 letters were *not* its top choice. That is on purpose. If it always picked the top letter, it would write the same thing every time, and often get stuck repeating itself.

### 5. How its writing grew

Here is the story it wrote at each checkpoint, always starting from "Once upon a time":

![An animation that shows one story per checkpoint, with the number of practice steps and its scores at the top.](growing.gif "Animation: the story it wrote at each checkpoint, with its scores at that moment.")

The same stories, side by side:

![Four short passages that each begin with Once upon a time. The first is random symbols, the second has word-like chunks, the third has speech in quotation marks, and the fourth reads like a fairy tale that does not quite make sense.](samples.png "What the storyteller wrote after 0, 300, 1,000 and {{result.steps}} practice steps, each time starting from “Once upon a time”.")

And here is one more, from early on, after just 100 practice steps. The spelling mistakes are exactly what it wrote:

> Once upon a timer ad the foun tour llore the oust wind he ont f mor hend spin ter, lsPr the thilothithawber we heokereir t he st, f inthad ind owhe w a Tono asom wowim, w he cies!’ rand fand ble th he he fo wen ce wethithes hed hengan.

What changed along the way:

- **After 0 steps:** random letters, numbers and symbols.
- **After 100 steps:** spaces, and little words like "the", "he" and "and". Most other "words" are made up.
- **After 300 steps:** mostly real words, with commas and quotation marks.
- **After 1,000 and {{result.steps}} steps:** people talking in quotation marks, like ‘I will’, in the old-fashioned style of the book. But the sentences still don't make sense.

### 6. What does it look back at?

Remember **attention**: in each layer, the model decides which earlier letters matter most for its guess. We can peek at that.

We gave the trained model this beginning and asked for the next letter:

> Once upon a time there was a king who had a daugh_

![Four rows of the same text in letter tiles, one row per layer, with a yellow question mark at the end. Darker orange tiles are the letters that layer looked back at most. In every layer the darkest tiles are in the last few letters, around daugh, and in the last layer also the a and d of had.](attention.png "Which earlier letters each of its 4 layers looks back at most, when guessing the letter after “daugh”. Darker = looked at more.")

Its guess: **t**, with almost 100% odds, to make "daughter".

Notice that it hardly looks at the beginning of the sentence. To finish "daugh", the last few letters are what matter, and all four layers look mostly at them. (Peeking inside a model like this gives clues, not a full explanation of how it thinks.)

### 7. The adventure dial

When the model writes, there is one more setting we can choose. We call it the **adventure dial**. Scientists call it **temperature**.

- **Turned down (careful):** it almost always picks its most likely letter.
- **In the middle (normal):** it usually picks likely letters, but sometimes surprises.
- **Turned up (wild):** unlikely letters get picked much more often.

All our other stories used the normal setting (0.8). Here is the same trained model, with the dial at three settings:

![Three dials with a needle pointing to careful, normal and wild, each next to a story. The careful story uses real words. The normal story is a bit stranger. The wild story is full of made-up words and odd capital letters.](dial.png "The same trained model writing with the adventure dial (temperature) set to careful (0.3), normal (0.8) and wild (1.5).")

On careful, it uses real words: "he was gone; and the saw that the witch in the house was still". On wild, it invents words like "furnifultaed" and "ChantiAlt". Neither setting makes a sensible story. The dial changes how adventurous it is, not how much it understands.

> [!TAKEAWAY]
> By playing one guessing game with one book, {{result.steps}} times, a tiny model learned a lot by itself. It learned spelling, common words, punctuation and the style of a fairy tale. On pages it had never seen, its first guess went from right about 1 time in 100 to about 60 times in 100. But it never learned to tell a story that makes sense.

## What this does and doesn't show

**It learned patterns, not just pages.** It guessed well on the hidden part of the book, which it never practised on. So it learned general patterns of the book.

**It does not understand stories.** Its stories sound like fairy tales, but characters appear and disappear and nothing really happens. Good guessing is not the same as understanding.

**It is tiny.** It has {{result.parameters}} knobs and read one book. Real chatbots have hundreds of billions of knobs, read huge amounts of text, and get extra training to be helpful and safe. Our experiment shows *how* they learn, not how good they are.

**Letters, not words.** Real chatbots guess chunks of text called **tokens**, which are often whole words or parts of words. We used single letters because they are easier to see.

**One run.** We trained it once, starting from one set of random knobs. Another run would write different stories. We did not check how different its scores would be.

**Old-fashioned English.** The book is an old translation, so the storyteller writes in that old-fashioned style.

## Try it yourself

You can play Shannon's game with a friend. Pick a sentence from a book. Show your friend one letter at a time, and before each letter, ask them to guess it. Count how many first guesses they get right. You will probably find what our storyteller found: the first letter of a word is hard, and the rest of the word is easy!
