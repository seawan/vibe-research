---
name: publish-vibe-research
description: Turn vibe-research results (experiments, notebooks, notes, figures) into a plain-language, paper-style Vibe Research post with real experiment results, machine-verified references, an honest AI-and-process record, and an optional Delta rerun package, then preview it and open a pull request to seawan/vibe-research. Use when asked to "publish this research", "write this up as a post", "submit to Vibe Research", "make this reproducible on Delta", or "/publish-vibe-research".
---

# Publish research to Vibe Research

Vibe Research is a static site (repo `seawan/vibe-research`). A post is one folder, `posts/<github-login>/<slug>/`, added by pull request. CI builds it in strict mode, so references must be verified, math must render, required sections must exist, and figures must be run outputs.

Paths below are relative to the repo root (called the repo). If the current directory is not inside a clone of `seawan/vibe-research`, stop and tell the user to fork and clone it first (`gh repo fork seawan/vibe-research --clone`, then `cd vibe-research && npm ci`), then continue from there. Read `CONTRIBUTING.md` in the repo if you need the exact rules.

Work through the steps in order. Never put a number in the post that you cannot trace to a file or a run.

## Hard rules (never break these)

1. **Ask before creating a Delta sandbox.** A sandbox uses the author's own Delta quota. Say what will run (image, GPU, time limit from `delta.yaml`) and wait for a yes before `npm run rerun -- <dir> --record`. `npm run rerun -- <dir> --record --dry-run` is free and needs no approval (plain `--dry-run` is only for checking an already recorded post).
2. **Ask before opening the pull request.** Show the preview and a summary first. Also ask before any `git push`.
3. **Never write `contribution` or `author_verification.checked` yourself.** Ask the author, and paste their words (light typo fixes only). Never set `author_verification.verified: true`, `by` or `date` before they have given their words.
4. **Never invent `ai` entries.** List only the tools and models the author says they used, with the role they describe. Ask for the exact model name if you are not sure.

## 1. Gather the research

- Find the results: ask which folder, notebook or run if it is not obvious from the conversation or current directory.
- Read the actual code, logs and result files. Note for every headline number **which file it came from**.
- If results are missing (no seeds, no baseline, no error bars) and the experiment is cheap, re-run it and save outputs. If not cheap, say so in the post's limitations instead of inventing anything.
- Ask the user only for things you cannot determine: the title angle, and anything ambiguous about the claims. Keep it to one round of questions.

## 2. Scaffold the post

```bash
npm run new -- "Post title"
```

This creates `posts/<your-github-login>/<slug>/index.md` (from `templates/post.md`, with `authors`, `license: CC-BY-4.0`, `code_license: MIT`, an empty `ai: []`, an unsigned `author_verification` and `draft: true`) and an empty `refs.json`. The login comes from `gh api user`; if `gh` is not logged in, ask the user for their GitHub login and run `npm run new -- --user <login> "Post title"`. It refuses to overwrite an existing folder.

Copy into the post folder: the code you actually ran (at least one code file), data files, and figures. Set `code:` in the front matter to the script or repo URL. Keep every file under 5 MB (25 MB per post); link bigger data and fetch it in `setup` of `delta.yaml`. Allowed types are listed in `CONTRIBUTING.md`.

Make the code readable. Readers open it in the browser, so clean it before shipping (without changing behaviour):

- A top docstring saying what the script does, what it writes, and how to run it.
- Settings as named constants at the top (`NUM_SEEDS = 50`, not a bare `50` deep in a loop).
- Small functions with plain names (`estimate_pi`, `random_shift`), each with a one-to-three-line docstring explaining *what* and *why*, plus a worked example where it helps.
- Section comments (`# Settings`, `# Experiment`, `# Output`) and short comments on non-obvious lines only.
- No dead code, commented-out experiments, or hard-coded personal paths.
- **After refactoring, re-run the script and confirm the outputs are identical** (e.g. `diff` the results file against the old one). If they differ, find out why before going on.

For a notebook, ship the `.ipynb` with outputs saved; strip huge outputs first.

Make figures readable: label axes with units, add a legend, use `dpi>=150`, keep the background white. **Save figures as PNG.** SVGs are checked against a strict allowlist and matplotlib SVGs (which contain `<style>` and `<metadata>`) are rejected.

## 3. Record the run: `delta.yaml` (optional, earns the badge)

Skip this step only if the experiment did not run on Delta; the post is then allowed but has no Delta-reproducible badge, and its specs are marked self-reported.

1. Write `delta.yaml` in the post folder **from the sandbox the author actually used** (image name, CPU, memory, GPU, GPU memory and type, `max_life`, `timeout`). Ask the author for these if you do not have them; never guess an image or GPU. The format is in the repo's design spec (section 6.2): `version`, `deployment`, `sandbox`, `upload`, `setup`, `command`, `timeout`, `outputs`, `expected`.
2. Make the script **print its final JSON summary** as the last line of stdout (for example `{"qmc_error_262k": 1.1e-4, "slope": -0.79}`). The run record keeps it as `result_summary`, and the post's `{{result.key}}` macros read from it.
3. List every file the run produces in `outputs` (the figures and result files you will show in the post).
4. Validate for free, before the first recording: `npm run rerun -- posts/<user>/<slug> --record --dry-run` (plain `--dry-run` needs published outputs, so it only works on an already recorded post). Fix everything it reports.
5. **Ask the author for approval**, naming the image/GPU/time limit, because this creates a Delta sandbox on their quota. Only after a yes:

   ```bash
   npm run rerun -- posts/<user>/<slug> --record
   ```

   It creates one sandbox, uploads, runs, pulls `outputs`, writes `run.json` and always kills the sandbox. If it fails or is interrupted, tell the author and check that no sandbox is left running.

   If `sandbox create` fails with "The quota check service rejected the request" even though `delta-cli usage` shows credit, the requested resources are over what the account may take with a GPU. On one account, `cpu: 4, memory: 16Gi` or a named `gpu_type` with `gpu: 1` was refused while `cpu: 2, memory: 8Gi` with no `gpu_type` worked. Lower `cpu`/`memory`, drop `gpu_type`, and try again (the dry run cannot detect this).
6. Read `run.json` and use the numbers from its `result_summary` in the post.

## 4. Write the post

Audience: a smart reader **outside** the field. Required H2 sections, in this order (others may sit between them):

1. **TL;DR** (front matter `tldr:`): three bullets: what we asked, what we found *with the key number*, what it does not show.
2. `## The question`: why anyone should care. No symbols.
3. `## Background in plain words` (optional name): intuition first (a `> [!INTUITION]` callout or an analogy), *then* the math.
4. `## What we did` (or `## Experiment` / `## Method`): enough detail to reproduce (data, model, hyperparameters, seeds, hardware, runtime), with `@include file.py#L41-L48` snippets of the real code.
5. `## Results`: figure(s) + a table + a `> [!TAKEAWAY]` callout with the one-sentence result. Then explain what to notice, numbered.
6. `## What this does (and doesn't) show`: honest limitations and things not tested.

**Do not write** `## Specs`, `## Author verification`, `## References` or `## Reproduce`. The build generates them (from `delta.yaml`, `run.json`, `author_verification`, `refs.json`) and rejects hand-written ones.

Figures: each embedded figure must be a file listed in `outputs` of `delta.yaml` (or in `outputs` of the front matter if there is no Delta run), or be a hand-made diagram whose caption ends with `{diagram}`. Headline numbers: write `{{result.key}}` (for example `{{result.slope}}`) instead of typing the number, so it comes from `run.json`.

Writing rules:

- **Define every symbol before it appears.** After every important equation write a sentence starting "In words: ...".
- Prefer short sentences and concrete examples (a `> [!EXAMPLE]` callout with actual numbers works well).
- Report spread (std / CI / seeds) with every number that has one. Round sensibly (2-3 significant figures).
- Never overclaim: "consistent with", "suggests" unless you actually proved it. If an experiment disagrees with theory, say so; that is often the most interesting part.
- Don't pad. 1,000-2,500 words is the usual sweet spot.
- Raw HTML in Markdown is shown as text, never rendered.

Markdown features available:

| Feature | Syntax |
|---|---|
| Inline / display math (KaTeX) | `$x^2$`, `$$ \sum_i x_i $$` on its own lines |
| Citation | `[@key]` or `[@a; @b]` → numbered link to the reference list |
| Figure with caption | `![alt text](figure.png "Caption. Can contain $math$.")` on its own line |
| Hand-made diagram | caption ends with `{diagram}` |
| Run number | `{{result.key}}` from `run.json` `result_summary` |
| Callouts | `> [!NOTE]`, `> [!INTUITION]`, `> [!TAKEAWAY]`, `> [!WARNING]`, `> [!DEFINITION]`, `> [!EXAMPLE]` |
| Tables, code blocks | GitHub-flavored Markdown; code is syntax-highlighted |
| Real code snippet | `@include experiment.py#L41-L48` on its own line → that snippet, linked to the full file |
| Link to a file | `[experiment.py](experiment.py)` → opens the readable HTML view |

Every code, CSV, TSV, JSON and notebook file in the folder gets a readable page and is listed in "Code & data". Snippet line ranges are checked at build time. In YAML front matter strings, escape backslashes in math (`"$2.4\\times10^{-3}$"`); in the Markdown body write LaTeX normally.

## 5. AI & process: ask the author

Ask the author, in one message:

- Which AI tools and exact model names did they use, and for what (this becomes `ai:`; at least one entry)?
- In their own words, what did they do and what did the AI do (this becomes `contribution:`, at least 40 characters)?
- Any public share links of the conversations (`chat_links`)?

Fill `ai:` only with what they answer, and paste their `contribution` text as given. Do not draft it for them or "improve" it beyond typos. If they ask for help phrasing it, offer options and let them pick or rewrite.

## 6. Save chat excerpts

The post needs at least one file in `chat/*.md` or a `chat_links` entry. Pick the key excerpts of the AI conversation (the question, important decisions, where the AI was corrected or wrong), save them as Markdown in `chat/`, and **show them to the author and ask to confirm they may share them** under their AI provider's terms. Remove names, keys, paths and unpublished data first. Do not save an excerpt the author has not approved.

## 7. References: add, verify, and check the claim

Every paper you cite goes in `posts/<user>/<slug>/refs.json`:

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
  { "key": "vaswani2017", "title": "Attention Is All You Need", "authors": ["Ashish Vaswani"], "year": 2017, "arxiv": "1706.03762", "claim": "..." },
  { "key": "numpy", "type": "web", "title": "NumPy", "url": "https://numpy.org/", "claim": "Library used." }
]
```

`doi` / `arxiv` are optional (the checker searches by title without them, and fills them in when found). `type: "web"` is for software, datasets and pages that are not papers; the checker only confirms the URL resolves.

- **Do not cite from memory without verification.** If you are not sure a paper exists, search for it first (WebSearch / arXiv) and take the title, authors, year and arXiv id/DOI from the actual paper page.
- Cite primary sources, and only papers whose content you have checked against the claim.

Then run:

```bash
npm run check-refs -- posts/<user>/<slug>
```

It looks each entry up in arXiv / Crossref / Semantic Scholar, compares title, first author and year, and writes `verified: true` plus the source into `refs.json`. It exits non-zero if anything fails. `--fix` replaces title/authors/year/venue with the canonical metadata.

- **FAIL "id resolves to a different paper"**: the arXiv id or DOI is wrong. Find the right one; don't just delete the id.
- **FAIL "not found"**: the paper may not exist (hallucinated) or the title is wrong. Search the web for it. If you cannot find it, **remove the citation and the claim that depends on it**.
- **Claim check (mandatory):** open `posts/<user>/<slug>/.refcheck.json`, read each `abstract` next to its `claim`, and confirm the abstract supports how the post uses the paper. If the abstract is missing (common for old papers and books), fetch the paper page with WebFetch and check there. If the claim is stronger than what the paper says, soften the sentence. In your final summary to the user, list each reference with one line on how its claim was checked.

## 8. Author verification: the author's own sign-off

Publishing requires the author's own check of the results. Ask them to verify the numbers and figures themselves (re-run, spot-check against the data files, read the cited sources), then ask them to write, in their own words, **what they actually checked** (specific: which run, which number, against what; boilerplate or empty text is rejected by CI).

Show the author the exact `checked` text (their words) and get an explicit confirmation before writing it into `author_verification.checked`; or ask them to edit the file themselves. Set `verified: true`, `by: <their GitHub login>`, `date: <today, YYYY-MM-DD>` only after that confirmation. **Never write `checked` yourself, never paraphrase it into something they did not say, and never mark `verified: true` on their behalf if they have not checked.** If they have not checked yet, leave the stub as is; the post stays a draft.

## 9. Build and preview

```bash
npm test                      # optional, the same suite CI runs
npm run build:drafts          # strict on math, references, sections, figures, schema
npm run serve                 # http://localhost:4321 (drafts shown)
```

Fix every `error:`. Then look at the post in the browser: math renders, figures load and are readable in dark mode, the table fits, citations link to the reference list, the AI & process box and Specs/Reproduce sections look right. Check one page at phone width. For a draft, schema problems appear as warnings; they become errors once `draft: true` is removed, so clear all of them.

## 10. Publish: fork, branch, pull request

1. Show the author the preview and a short summary: title, TL;DR, figures, reference check results, the `ai` and `contribution` text as written, the author-verification text, whether the post earns the Delta badge. **Ask before opening the pull request.**
2. If `author_verification` is not complete (`verified: true`, `by`, `date`, specific `checked`), stop here: keep `draft: true` and do not open the PR. Otherwise, on approval: remove `draft: true` from the front matter and run `npm run build` (strict). Fix any error.
3. Create a branch, commit only `posts/<user>/<slug>/`, and open the PR (check that `origin` is the author's fork, or fork first with `gh repo fork seawan/vibe-research`):

   ```bash
   git switch -c post/<slug>
   git add posts/<user>/<slug>
   git commit -m "post: <title>"
   git push -u origin post/<slug>
   gh pr create --repo seawan/vibe-research --title "post: <title>" --body "<one-paragraph summary and the contribution statement>"
   ```

   The PR may touch nothing outside `posts/<user>/<slug>/` (CI rejects anything else, including `refcache.json`). Pushing and `gh pr create` happen only after the author's yes.
4. Tell the author what happens next: the PR checks workflow runs (tests, reference re-check, strict build) and posts a checklist comment; the owner reviews and merges by hand; the site rebuilds from `main`. A post can be taken down by reverting its commits.
