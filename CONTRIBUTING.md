# Contributing to Vibe Research

Vibe Research publishes AI-assisted research written up like a short paper: a real experiment, verified references, an honest account of what the AI did, and (ideally) a package anyone can rerun on Delta.

You contribute by opening a pull request that adds or edits **one folder of your own**: `posts/<your-github-username>/<slug>/`. The site rebuilds from `main` after the owner merges.

## The post folder

```
posts/<you>/<slug>/
  index.md      front matter + write-up (required)
  refs.json     references, if anything is cited
  *.py, ...     the code you actually ran (at least one code file)
  data, figures outputs of the run
  chat/*.md     key AI conversation excerpts (or chat_links in front matter)
  delta.yaml    rerun spec (optional; earns the Delta-reproducible badge)
  run.json      written by `npm run rerun -- <postDir> --record`
```

Front matter (on top of `title`, `subtitle`, `date`, `summary`, `tags`, `tldr`, `code`):

```yaml
authors: [octocat]                  # GitHub usernames; the first one owns the folder
ai:                                 # at least one
  - { name: "Claude", model: "claude-opus-5-5", role: "derivations, experiment code" }
contribution: "I chose the question, checked every derivation by hand and ran all experiments. Claude wrote the first draft of experiment.py."
chat_links: ["https://claude.ai/share/..."]   # optional public share links
license: CC-BY-4.0                  # text license
code_license: MIT                   # code license (required)
author_verification:                # written by you, never by a tool
  verified: true
  by: octocat
  date: 2026-11-01
  checked: "Re-ran the experiment twice with different seeds; checked the slope by hand against results.csv; read all cited sources."
```

### Required structure

Every post reads like a short paper, in this order:

1. **TL;DR** (`tldr` in front matter): what was asked, what was found, what it does not show.
2. **AI & process** box (generated from `ai`, `contribution`, `chat/`).
3. `## The question` (and any background sections): plain-language framing.
4. **Specs: system & compute**: generated from `delta.yaml` and `run.json`; marked "self-reported" for posts without a Delta run.
5. `## What we did` (or `## Experiment` / `## Method`): the method, with `@include file.py#L10-L20` links into the real code.
6. `## Results`: figures and numbers from the run. Each figure must be a file listed in `outputs` of `delta.yaml`, or marked as a hand-made diagram in its caption.
7. **Author verification**: your sign-off from `author_verification`. `checked` must say what you actually checked; empty or boilerplate text is rejected.
8. **References**: from `refs.json`, every entry verified against arXiv / Crossref / Semantic Scholar.
9. **Reproduce**: the Delta box and the Code & data list.

You write sections 3, 5 and 6. Do not write `## Specs`, `## Author verification`, `## References` or `## Reproduce` yourself: the build generates them and rejects hand-written ones. Raw HTML in Markdown is shown as text, never rendered.

### Interactive figures

For something readers can play with, write a small `.js` file in your post folder and add a line like this on its own:

```
@interactive widgets.js#odds data=probes.json:odds:alphabet,results.csv "Caption shown under the figure."
```

`#odds` is passed to your script as `VIBE.name`. `data=` lists files from your `outputs`, optionally with the top-level keys to include, and the build copies them in as `VIBE.data["probes.json"]` (CSV becomes a list of rows; at most 200 KB per figure). Your script also gets `root` (the element to draw in), `h(tag, attrs, ...children)` and `report()` (refit the height).

`data=` may also list pictures from `outputs`, which arrive as data URLs. Add `kit=lesson` to turn the figure into a game in stages: call `lesson({ stages, finish })` from your script. The step types are described at the top of `scripts/lib/lesson-kit.js`, and `posts/seawan/birthday-surprise/game.js` is a full example.

The script runs in a sandboxed frame: no access to the page, no network, and no storage. It must show results from the data it is given. If it calculates anything new, say so in the post. Keep a static picture of the main result too, for readers without JavaScript. The script appears in the Code & data list, and the moderator reads it.

The easiest way to get all of this right is the `/publish-vibe-research` skill in `skills/publish-vibe-research/`.

## Licenses

- **Text:** `CC-BY-4.0` (default), `CC-BY-SA-4.0` or `CC0-1.0`.
- **Code:** `MIT` (default), `Apache-2.0`, `BSD-3-Clause` or `CC0-1.0`. `code_license` is required.

By opening a PR you confirm that you have the right to publish everything in your folder under these licenses, and that **you may share the `chat/` excerpts and share links under your AI provider's terms**. Remove anything private (names, keys, unpublished data) from the excerpts before committing.

## Limits and file types

- At most **5 MB per file** and **25 MB per post**. Large datasets and checkpoints must be linked, not committed; fetch them in `setup` of `delta.yaml`.
- Allowed file types: `md json yaml yml csv tsv txt py ipynb jl r sh js mjs ts lean c cpp h rs go java m tex bib toml cfg ini png jpg jpeg gif webp svg pdf`. No executables, no HTML, no files without an extension, no symlinks.
- SVG files are checked against a strict allowlist: only plain drawing elements (`svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath title desc linearGradient radialGradient stop clipPath mask pattern marker image`), no `<style>`, `<script>`, `<foreignObject>`, `<a>` or animation elements, no namespaced elements, no `on*` attributes, no DOCTYPE/entities (only `&amp; &lt; &gt; &quot; &apos;`), and links only to `#fragments` or files in the post. Matplotlib SVGs include `<metadata>` and `<style>` and are rejected: prefer PNG, or strip those elements.

## What CI checks on your PR

The **PR checks** workflow runs with a read-only token and checks:

- the PR only changes files inside `posts/<user>/<slug>/` folders (nothing else, including `refcache.json`: running `check-refs` locally updates it, so leave that change out of your PR, e.g. `git checkout -- refcache.json`);
- a new post lives in your own folder (named exactly as your GitHub login, same case) and lists you in `authors`; an existing post may only be changed by someone listed in its `authors` **on `main`** (adding yourself to someone else's post in the same PR does not count);
- file types, file sizes and post sizes, as above;
- `npm test`, a references re-check (`check-refs --ci`: `verified` flags in your `refs.json` are not trusted; a network failure is reported as "retry", not as a failure), and a full build including drafts (front matter, required sections, figure provenance, badge).

A second workflow then posts one checklist comment on the PR with each result, each changed post's badge status (and why it has no badge), and the moderator's manual items. The built site is attached to the run as the `site-preview` artifact.

## Review and takedown

- Every PR needs a human merge by the owner (see `.github/CODEOWNERS`). The moderator checks by hand that:
  - claims match cited sources
  - AI & contribution statement plausible
  - author verification is specific
- Posts can be edited after merge by any listed author, through a new PR.
- **Takedown = revert.** A post that breaks these rules, infringes someone's rights or turns out to be wrong in a misleading way is removed by reverting its commits. Ask for a takedown by opening an issue.

## Rerunning on Delta

The Delta-reproducible badge means anyone can rerun your experiment on Delta. Delta is open to anyone who registers:

1. Register for Delta and install `delta-cli`, then log in with it (follow the Delta documentation). The site and CI never hold Delta credentials; runs use your own account.
2. Write `delta.yaml` in your post folder (image, resources, `command`, `outputs`); `npm run rerun -- <postDir> --dry-run` validates it and prints the delta-cli commands without running anything.
3. Record the real run:

   ```bash
   npm run rerun -- posts/<you>/<slug> --record
   ```

   This creates one sandbox, uploads the folder, runs the command, pulls the `outputs` back into the post folder, writes `run.json`, and always kills the sandbox. Commit the outputs and `run.json`.

Readers rerun a published post with `npx -y github:seawan/vibe-research#<commit> <user>/<slug>`; the Reproduce box shows the exact command, pinned to the commit that last changed the post.

## Local preview

```bash
npm ci
npm test
npm run check-refs -- posts/<you>/<slug>   # verify refs.json (also updates refcache.json: do not commit that)
npm run serve                              # http://localhost:4321, drafts shown
npm run build                              # strict build, as on main
```
