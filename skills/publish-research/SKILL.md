---
name: publish-research
description: Turn vibe-research results (experiments, notebooks, notes, figures) into a plain-language technical-report blog post with math, real experiment results and machine-verified references, then build and publish it to the personal blog. Use when asked to "publish this research", "write this up as a blog post", "release these results", or "/publish-research".
---

# Publish research to the blog

The blog lives at `/Users/junwang/math-verification/blog` (called `BLOG` below). It is a static site: one folder per post in `BLOG/posts/<slug>/` with `index.md`, `refs.json`, figures and data. `npm run build` refuses to publish if a citation is missing or unverified, or if any math fails to render.

Work through the steps in order. Do not skip the reference check, and never put a number in the post that you cannot trace to a file or a run.

## 1. Gather the research

- Find the results: ask the user which folder/notebook/run if it is not obvious from the conversation or current directory.
- Read the actual code, logs and result files. Note for every headline number **which file it came from**.
- If results are missing (no seeds, no baseline, no error bars) and the experiment is cheap, re-run it and save outputs. If not cheap, say so in the post's limitations instead of inventing anything.
- Ask the user only for things you cannot determine: the title angle, and anything ambiguous about the claims. Keep it to one round of questions.

## 2. Scaffold the post

```bash
cd BLOG && npm run new -- "Post title"
```

This creates `posts/<slug>/index.md` (from `templates/post.md`, with `draft: true`) and an empty `refs.json`. Copy into the post folder: figures (PNG/SVG), the experiment script, and a small results file (CSV/JSON). Link them from the post, and set `code:` in front matter to the script or repo URL.

Make the code readable. Readers will open it in the browser, so clean it before shipping (without changing behaviour):

- A top docstring saying what the script does, what it writes, and how to run it.
- Settings as named constants at the top (`NUM_SEEDS = 50`, not a bare `50` deep in a loop).
- Small functions with plain names (`estimate_pi`, `random_shift`), each with a one-to-three-line docstring explaining *what* and *why*, plus a worked example where it helps.
- Section comments (`# Settings`, `# Experiment`, `# Output`) and short comments on non-obvious lines only.
- No dead code, commented-out experiments, or hard-coded personal paths.
- **After refactoring, re-run the script and confirm the outputs are identical** (e.g. `diff` the results file against the old one). If they differ, find out why before going on.

For a notebook, ship the `.ipynb` with outputs saved: it is rendered as a page with markdown, math, code and plots. Strip huge outputs first.

Make figures readable: label axes with units, add a legend, use `dpi≥150`, and keep the background white (the site wraps images on white in dark mode).

## 3. Write the report

Audience: a smart reader **outside** the field. Structure (the template already has it):

1. **TL;DR** (front matter `tldr:`): three bullets: what we asked, what we found *with the key number*, what it does not show.
2. **The question**: why anyone should care. No symbols.
3. **Background in plain words**: intuition first (use a `> [!INTUITION]` callout or an analogy), *then* the math.
4. **What we did**: enough detail to reproduce (data, model, hyperparameters, seeds, hardware, runtime).
5. **Results**: figure(s) + a table + a `> [!TAKEAWAY]` callout with the one-sentence result. Then explain what to notice, numbered.
6. **What this does (and doesn't) show**: honest limitations and things not tested.
7. **Reproduce it**: exact commands.

Writing rules:

- **Define every symbol before it appears.** After every important equation write a sentence starting "In words: …".
- Prefer short sentences and concrete examples (a `> [!EXAMPLE]` callout with actual numbers works well).
- Report spread (std / CI / seeds) with every number that has one. Round sensibly (2–3 significant figures).
- Never overclaim: "consistent with", "suggests" unless you actually proved it. If an experiment disagrees with theory, say so; that is often the most interesting part.
- Don't pad. 1,000–2,500 words is the usual sweet spot.

Markdown features available:

| Feature | Syntax |
|---|---|
| Inline / display math (KaTeX) | `$x^2$`, `$$ \sum_i x_i $$` on its own lines |
| Citation | `[@key]` or `[@a; @b]` → numbered link to the reference list |
| Figure with caption | `![alt text](figure.png "Caption. Can contain $math$.")` on its own line |
| Callouts | `> [!NOTE]`, `> [!INTUITION]`, `> [!TAKEAWAY]`, `> [!WARNING]`, `> [!DEFINITION]`, `> [!EXAMPLE]` |
| Tables, code blocks | GitHub-flavored Markdown; code is syntax-highlighted |
| Real code snippet | `@include experiment.py#L41-L48` on its own line → that snippet, with a link to the lines in the full file |
| Link to a file | `[experiment.py](experiment.py)` → opens the readable HTML view (code, CSV, notebook) |

Every code, CSV, TSV, JSON and notebook file in the post folder automatically gets a readable page (`<file>.html`, with line numbers and `#L10-L20` line links) and is listed in a "Code & data" section at the end of the post. Use `@include` to show the 5–20 lines that implement each key idea right next to its explanation, instead of pasting code by hand (pasted code can drift from the real script). Snippet line ranges are checked at build time.

In YAML front matter strings, escape backslashes in math (`"$2.4\\times10^{-3}$"`). In the Markdown body write LaTeX normally.

## 4. References: add, verify, and check the claim

Every paper you cite goes in `posts/<slug>/refs.json`:

```json
[
  {
    "key": "he2015",
    "title": "On the convergence rate of randomized quasi-Monte Carlo for discontinuous functions",
    "authors": ["Zhijian He", "Xiaoqun Wang"],
    "year": 2015,
    "doi": "10.1137/15M1007963",
    "claim": "What we cite this paper for, in one sentence."
  },
  { "key": "vaswani2017", "title": "Attention Is All You Need", "authors": ["Ashish Vaswani"], "year": 2017, "arxiv": "1706.03762", "claim": "…" },
  { "key": "numpy", "type": "web", "title": "NumPy", "url": "https://numpy.org/", "claim": "Library used." }
]
```

`doi` / `arxiv` are optional (the checker searches by title without them, and fills them in when found). `type: "web"` is for software, datasets and pages that are not papers; the checker only confirms the URL resolves.

Rules:

- **Do not cite from memory without verification.** If you are not sure a paper exists, search for it first (WebSearch / arXiv) and take the title, authors, year and arXiv id/DOI from the actual paper page.
- Prefer citing primary sources for each claim, and only cite papers whose content you have checked against the claim.

Then run the checker:

```bash
cd BLOG && npm run check-refs -- posts/<slug>
```

It looks each entry up in arXiv / Crossref / Semantic Scholar (by arXiv id, DOI, or title search), compares title, first author and year, and writes `verified: true` plus the source into `refs.json`. It exits non-zero if anything fails. `--fix` replaces title/authors/year/venue with the canonical metadata.

- **FAIL "id resolves to a different paper"**: the arXiv id or DOI is wrong. Find the right one; don't just delete the id.
- **FAIL "not found"**: the paper may not exist (hallucinated) or the title is wrong. Search the web for it. If you cannot find it, **remove the citation and the claim that depends on it**.
- **Claim check (mandatory):** open `posts/<slug>/.refcheck.json`, read each `abstract` next to its `claim`, and confirm the abstract supports how the post uses the paper. If the abstract is missing (common for old papers and books), fetch the paper page or abstract with WebFetch and check there. If the claim is stronger than what the paper says, soften the sentence in the post. In your final summary to the user, list each reference with one line on how its claim was checked.

## 5. Build and preview

```bash
cd BLOG && npm run build:drafts      # strict on math + missing keys
```

Fix every `error:`. Then preview: start the `blog` server from `/Users/junwang/math-verification/.claude/launch.json` (or `npm run serve`, port 4321) and look at the post in the browser: math renders, figures load and are readable in dark mode, the table fits, citations link to the reference list. Check one page at phone width.

## 6. Publish

1. Show the user the preview and a short summary (title, TL;DR, figures, reference check results). **Ask before publishing.**
2. On approval: remove `draft: true` from the front matter and run `npm run build` (strict: fails on any unverified reference).
3. Commit in `BLOG` with a message like `post: <title>`. Push only if the user agrees; pushing to `main` deploys via GitHub Pages (`.github/workflows/deploy.yml`). If no remote is set up yet, point the user to the README's "Deploy" section instead of creating one yourself.
