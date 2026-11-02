---
name: publish-vibe-research
description: Write and publish a Vibe Research post (seawan/vibe-research), either from an idea or from existing results. Designs and runs the experiment on Delta, makes pictures and animations from the real outputs, writes a plain-language or kid-friendly post, verifies references, previews it, and opens a pull request. Use when asked to "write a Vibe Research post", "publish this research", "write this up as a post", "make this reproducible on Delta", or "/publish-vibe-research".
---

# Publish a Vibe Research post

A post is one folder, `posts/<github-login>/<slug>/`, added by pull request to `seawan/vibe-research`. CI builds it strictly: references must be verified, math must render, required sections must exist, and every figure must be a real run output. The full rules are in the repo's `CONTRIBUTING.md`; this skill is the working recipe.

## 0. Find the site folder

The skill can be started from any folder. All post work happens in a local copy (clone) of the repo, called **the site folder** below; the folder the user started in is **the research folder**.

1. If the current folder is inside a clone of `seawan/vibe-research` (check `git remote -v`), that is the site folder.
2. Otherwise, look for an existing clone: `readlink` of `~/.claude/skills/publish-vibe-research` (the skill is usually a symlink into a clone), then common places such as `~/vibe-research` and `~/*/vibe-research`. Confirm with `git -C <dir> remote -v`. If one is found, tell the user which one you will use.
3. If none is found, ask the user where their copy is. If they have none, offer to make one: `gh repo fork seawan/vibe-research --clone` (the owner runs `gh repo clone seawan/vibe-research` instead), then `npm ci` inside it.
4. In the site folder, run `git fetch origin` and start new work from `origin/main`. Run every `npm run` command from the site folder.

If the user started in a research folder, read its code, notebooks, data and figures there, and copy the files the post needs into the post folder in step 2. Do not move or change the user's originals.

## Hard rules

1. **Every number traces to a file.** Never write a number you cannot point to in a run output.
2. **Ask before each Delta run.** It uses the author's quota. Name the image, GPU and time limit, and wait for a yes. Always kill the sandbox afterwards, also on error.
3. **The author writes their own sign-off.** `contribution` and `author_verification.checked` are the author's words. If they ask for help, offer a draft and let them accept or rewrite it; never fill these in silently, and never set `verified: true` before they confirm.
4. **List only the AI tools actually used** in `ai:`, with what each did (for example Claude for code and text, ChatGPT/Codex for a rewrite).
5. **Ask before pushing or opening the pull request.**

## 1. Agree on the post

Find out, in one short round of questions (skip what is already clear):

- **Start point:** an idea (you design the experiment) or existing results (read them first; note which file each headline number comes from).
- **Reader:** an adult outside the field, or children (about age 12). This sets the writing style in step 4.
- **Pictures:** how many, and whether animations are wanted. When in doubt, more pictures.

## 2. Set up the folder and the code

```bash
npm run new -- "Post title"
```

Run it in the site folder. This makes `posts/<login>/<slug>/` with `index.md` (a draft) and an empty `refs.json`. If `gh` is not logged in, add `--user <login>`. When starting from existing results, copy the code and data from the research folder into this post folder.

Write the code so a reader can open it in the browser and follow it:

- `experiment.py` runs the experiment. Settings are named constants at the top, with small, plainly named functions. Its **last stdout line is one JSON object** of headline numbers; this becomes `result_summary`, read in the post as `{{result.key}}`.
- `pictures.py` (separate) draws every picture from the saved outputs (CSV/JSON), so pictures can be redrawn without retraining.
- Save small probe files (for example `probes.json`) holding exactly the examples the pictures and text show, so every example in the post is real.
- If something is random, use the real thing in pictures (the real first batch, the real model guesses), not a separate random draw that only looks similar.

## 3. Run it on Delta

Write `delta.yaml` (see existing posts in `posts/seawan/*/delta.yaml`):

```yaml
version: 1
deployment: domestic
sandbox: { image: "PyTorch CUDA13 (GPU)", cpu: 2, memory: 8Gi, gpu: 1, gpu_mem: 8000, max_life: 60 }
upload: "."
setup: "pip install matplotlib"
command: "python experiment.py && python pictures.py"
timeout: 2400
outputs: [results.csv, probes.json, learning.png, odds.gif]   # every file the post shows
```

- Use a CPU image and no `gpu` for small experiments. The GPU settings above are known to work; larger `cpu`/`memory` or a named `gpu_type` can be refused by the quota check.
- Keep delta-cli up to date (`npx @delta-infra/cli@latest install`).
- Validate for free: `npm run rerun -- posts/<login>/<slug> --record --dry-run`.
- After the author says yes: `npm run rerun -- posts/<login>/<slug> --record`. It creates one sandbox, runs, pulls the `outputs`, writes `run.json` and kills the sandbox. Run it in the background; it can take many minutes.
- Afterwards check `delta-cli sandbox list --status running` is empty. Kill anything left over.

## 4. Write the post

Required, in this order: `tldr:` (three bullets in front matter: question, finding with the key number, what it does not show), `## The question`, `## What we did`, `## Results`. End with `## What this does and doesn't show` (not checked by the build, but every post has one). **Do not write** `## Specs`, `## Author verification`, `## References` or `## Reproduce`; the build makes them.

For every reader:

- Use `{{result.key}}` for headline numbers. Any number typed by hand must be checked against the output files before publishing.
- Each embedded figure must be in `outputs` of `delta.yaml`, or be a hand-made diagram whose caption ends with `{diagram}`.
- Explain what to notice in each picture, in the caption or the text right after it.
- Say honestly what was not tested. Use "suggests" unless something was proved.

**For children (about 12):**

- Short sentences. Define every new word in **bold** the first time, with an everyday comparison (a "practice round", a "dial").
- Explain **every setting** of the experiment with a concrete example: what it is, the value used, and what would change if it were bigger or smaller.
- Show before telling: a picture or animation for each idea, then the words.
- Put technical details (model size, optimizer, citations, hardware) in `> [!NOTE]` callouts starting **For grown-ups.**
- Give the reader something to try: a guess to make before a picture, a game to play.
- Optional: ask ChatGPT (Codex CLI) to rewrite the post for young readers, then re-check every number and figure reference against the outputs, and add ChatGPT to `ai:`.

Markdown features: `$math$` and `$$display$$` (KaTeX), `[@key]` citations, `![alt](file.png "Caption")` figures, callouts (`[!NOTE]`, `[!INTUITION]`, `[!TAKEAWAY]`, `[!WARNING]`, `[!DEFINITION]`, `[!EXAMPLE]`), tables, and `@include experiment.py#L10-L20` for real code. Raw HTML is shown as text, so interactive widgets are not possible; use GIF animations instead.

## 5. Pictures and animations

- PNG for still pictures: labelled axes in words, readable font sizes, white background, `dpi>=150`, `bbox_inches="tight"`. Check each one by eye for overlaps and cut-off titles.
- GIF for animations: fixed frame size, quantized to about 64 colours, a pause on the last frame, under 5 MB. Also save the key frame as a PNG so the idea survives without motion.
- No matplotlib SVGs (rejected). No HTML files. At most 5 MB per file and 25 MB per post.

## 6. References and chat excerpts

- Put cited papers in `refs.json` (`key`, `title`, `authors`, `year`, `doi` or `arxiv`, and a one-line `claim`). Never cite from memory: look the paper up first.
- Run `npm run check-refs -- posts/<login>/<slug>`. If a paper is not found, fix the details or remove it and the claim that uses it. Read each abstract in `.refcheck.json` against its `claim` and soften the sentence if needed.
- Do not commit the `refcache.json` change that `check-refs` makes (`git checkout -- refcache.json`).
- The post needs at least one `chat/*.md` excerpt or a `chat_links` entry. Save the key prompts and decisions, remove anything private, and show them to the author before committing.

## 7. Preview and sign-off

```bash
npm run build:drafts && npm run serve     # http://localhost:4321
```

Fix every error. Look at the page: pictures load, animations play, math renders, tables fit, and the text works at phone width.

Then show the author the preview and ask, in one message, for:

- `ai:` entries (tools and models used, and for what);
- `contribution` (what they did and what the AI did);
- `author_verification.checked` (what they actually checked; must be specific).

After they confirm the exact words, set `verified: true`, `by: <login>`, `date: <today>`, remove `draft: true`, and run the strict `npm run build`.

## 8. Publish

After the author says yes:

```bash
git switch -c post/<slug> origin/main
git add posts/<login>/<slug>
git commit -m "post: <title>"
git push -u origin post/<slug>
gh pr create --repo seawan/vibe-research --title "post: <title>" --body "<summary and contribution>"
```

- The PR may change only files in `posts/<login>/<slug>/`.
- CI runs tests, re-checks references and builds the site, then posts a checklist comment. If a check fails, read the log and fix it.
- The site owner merges (for the owner's own post: after checks pass, `gh pr merge <n> --squash --delete-branch`, with the author's yes). The site deploys from `main` in a few minutes.
- After the deploy, check the live page at `https://seawan.github.io/vibe-research/posts/<login>/<slug>/`: the title, the Delta-reproducible badge, no leftover `{{result`, and every picture returns 200 (use `curl -sI`; browser checks miss lazy-loaded images).

To change a published post later, edit the same folder, rerun if outputs change, and open a new PR the same way.
