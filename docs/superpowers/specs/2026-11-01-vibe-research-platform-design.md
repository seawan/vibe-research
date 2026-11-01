# Vibe Research: design

Date: 2026-11-01 · Owner: Jun Wang · Status: ready for approval

## 1. Intent

A public, Medium-style publishing site for **vibe research**: research that a person did together with an AI (Claude, ChatGPT, Gemini, …), on any subject. Anyone can publish. Posts read like good articles, but carry what a paper carries: checked references, the real code and data, the figures the code produced, and enough to **rerun the experiment** on Delta.

Why: AI-assisted research is mostly lost in chat logs or posted as unverifiable threads. This gives it a home where the work is honest about how it was made (which AI, what the human did) and can be reproduced.

The engine comes from the existing single-author blog in this folder (`blog/`, "Vibe Research Notes"): Markdown + KaTeX, numbered figures, callouts, `[@key]` citations verified against arXiv/Crossref/Semantic Scholar, code/CSV/notebook viewers, `@include file#Lx-Ly`, and the `/publish-research` Claude Code skill. That blog stays as the owner's personal site; Vibe Research is a separate repo and site.

## 2. Goals

1. Anyone with a GitHub account can publish a post by running one Claude Code skill.
2. Every post states which AI(s) were used and what the human vs. the AI contributed.
3. Every post ships its code, data and figures, and its references are machine-verified.
4. A post that includes a valid Delta package gets a **Delta-reproducible** badge, and any reader with delta-cli access can rerun it with one command.
5. Reading feels like Medium: clean typography, home feed, tags, author pages, search, RSS.

## 3. Non-goals (v1)

- In-browser writing, accounts on the site, or a database (that is "option B", possibly later).
- Comments, claps/likes, follows, notifications.
- The site rerunning experiments. **Publishing trusts the author.** The badge means "packaged to be rerun", not "rerun by us".
- Paid content, monetization.

## 4. Anti-goals (failure even if it works)

- Posts that look rigorous but aren't: unverified citations, figures not produced by the shipped code, hidden AI involvement.
- A badge that is handed out for a package that can't actually run (e.g. missing files, no command).
- Requiring Delta to *read* a post. Delta is the easy way to rerun, never a gate on reading or downloading.
- Leaving Delta sandboxes running (they have no TTL and hold GPUs).

## 5. Decided (by the owner)

- Open to anyone; not a personal blog; any research topic.
- Delta (delta-cli) is open to anyone who registers.
- Every post follows the fixed format in 6.1a, including system & compute specs, run-produced results, an author verification sign-off, and internally verified references.
- All three distinguishing features matter: AI provenance + process, rigor (refs, code, data), human/AI contribution.
- Authors run experiments on Delta (GPU / sandbox for larger projects) **before** publishing, like a paper.
- Reproducibility: the published code + figures + Delta sandbox spec let anyone (person or Delta cloud agent) rerun.
- Trust the author at publish time; give the Delta-reproducible badge for posts that include a delta-cli package.
- Publishing is via GitHub pull requests from a Claude Code skill (option A), with human merge.
- Name: "Vibe Research" for now.

## 6. How it works

### 6.1 Post package

Each post is a folder `posts/<github-username>/<slug>/`:

| File | Required | Purpose |
|---|---|---|
| `index.md` | yes | Front matter + write-up (existing format) |
| `refs.json` | if anything is cited | Verified references (existing format) |
| code, data, figures | yes (≥1 code file) | Copied next to the page, rendered by existing viewers |
| `chat/` | yes (≥1 file) | Key AI conversation excerpts as Markdown, or a share link listed in front matter |
| `delta.yaml` | no | The rerun spec; presence + validity earns the badge |

New front-matter fields (on top of `title, subtitle, date, summary, tags, tldr, code`):

```yaml
author: octocat                     # GitHub username; must match folder and PR author
ai:                                 # at least one
  - { name: "Claude", model: "claude-opus-5-5", role: "derivations, experiment code" }
  - { name: "ChatGPT", model: "gpt-…", role: "literature search" }
contribution: "I chose the question, checked every derivation by hand, and ran all experiments. Claude wrote the first draft of experiment.py."
chat_links: ["https://claude.ai/share/…"]   # optional public share links
license: "CC-BY-4.0"                         # text; code license may be given separately as code_license
```

The post page renders an **AI & process** box (models, roles, contribution statement, links to `chat/` excerpts and share links) near the top.

### 6.1a Required post format (decided by the owner)

Every post follows one fixed structure, like a short paper. The template and CI enforce the sections, in this order:

1. **TL;DR**: what was asked, what was found, what it does not show (existing `tldr`).
2. **Question & background**: plain-language framing (existing house style).
3. **Specs: system & compute**: what the experiment ran on. Generated, not hand-written, from `delta.yaml` plus the actual run record (image, CPU/GPU type and count, memory, run time, package versions, random seeds, date, `execution_id`). Hand-written only for posts with no Delta run, and then marked "self-reported".
4. **Experiment / research**: the method and what the code does, with `@include` links into the real code.
5. **Results**: figures and numbers produced by the run. Each figure and key number is traced to a file in `outputs` (or the run's final stdout JSON); CI fails a figure that is neither a run output nor explicitly marked as a hand-made diagram.
6. **Author verification**: the author's own sign-off on the results, required to publish. Front matter:

   ```yaml
   author_verification:
     verified: true
     by: octocat
     date: 2026-11-01
     checked: "Re-ran the experiment twice with different seeds; checked the N^-0.79 slope by hand against results.csv; read all cited sources."
   ```

   The skill asks the author directly and never fills this in itself. `checked` must say what was actually checked (CI rejects empty or boilerplate text). The page shows it as a signed box above the references.
7. **References**: verified internally by the platform's checker (Section 7a): every cited entry must resolve against arXiv / Crossref / Semantic Scholar, re-checked in CI, and shown with a ✓ on the page.
8. **Reproduce**: the Delta box (Section 6.3) and the Code & data list.

The AI & process box sits between the TL;DR and the question.

### 6.2 `delta.yaml` (rerun spec)

Maps one-to-one onto delta-cli flags so the rerun script is a thin translation:

```yaml
version: 1
deployment: overseas              # domestic | overseas: image catalogs and mirrors differ
sandbox:
  image: "PyTorch CUDA13 (GPU)"   # --image-name (name from `delta-cli sandbox images`)
  cpu: 4                           # --cpu
  memory: 16Gi                     # --memory
  gpu: 1                           # --gpu
  gpu_mem: 24000                   # --gpu-mem (MiB per GPU)
  gpu_type: "RTX 4090"             # --gpu-type (optional)
  shm_size: 4Gi                    # --shm-size (optional, ≤ memory)
  max_life: 120                    # --max-life minutes
upload: "."                        # dir (relative to post folder) sent with `sandbox upload`
setup: "pip install -r requirements.txt"   # optional, run before command
command: "python experiment.py"    # run with `sandbox run-bg --wait`
timeout: 3600                      # --timeout seconds
outputs:                           # files the run produces, pulled back with `sandbox pull`
  - results.csv
  - error.png
expected:                          # optional: numbers to compare (from the final stdout JSON)
  rel_tolerance: 0.05
  values: { qmc_error_262k: 1.1e-4 }
```

**Rerun flow** (`npx vibe-rerun <post-url-or-path>`, also usable by a Delta cloud agent): download the post's files → `sandbox create` with the spec → `sandbox upload` → optional setup → `sandbox run-bg --wait` → `sandbox pull` each output → **always** `sandbox kill`, including on failure/interrupt → print a side-by-side of produced vs. published outputs (file hashes; `expected.values` within tolerance). Reader-side reruns are not reported back to the site in v1.

### 6.3 Badge rule (checked in CI, no compute)

A post gets **Delta-reproducible** iff `delta.yaml` exists, validates against the schema, and every file it references (`upload` dir contents, the script(s) named in `command`, every `outputs` entry) is present in the post folder, and every figure embedded in `index.md` is either listed in `outputs` or marked `generated: false` in its caption metadata. Otherwise no badge (not an error).

### 6.4 Authoring skill

Extend `/publish-research` into a shared skill shipped in the repo (and installable as a plugin): gather results → write post in house style → verify references → collect AI provenance (asks the author; never invents the contribution statement) → package `chat/` excerpts → generate `delta.yaml` from the sandbox the author actually used → `vibe-rerun --dry-run` to validate → local preview → fork + branch + open PR (asks before opening it).

### 6.5 CI on pull requests

Strict build (existing: missing/unverified refs and math errors fail), plus: front-matter schema (author, ai, contribution, license required), author/folder/PR-author match, PR only touches the author's own `posts/<username>/` folder, size limits (per file and per post; large data must be linked, not committed), file-type allowlist (no executables, no HTML/JS injected into pages; Markdown raw HTML sanitized), badge computation. CI posts a preview link and a checklist comment.

### 6.6 Moderation

Human merge required (CODEOWNERS = owner at first). Takedown = revert. `CONTRIBUTING.md` states the content rules and license.

### 6.7 Reader site (static, GitHub Pages via Actions)

- Home: feed of latest posts (card: title, subtitle, author avatar from GitHub, tags, AI badges, Delta badge, reading time).
- Post page: existing renderer + AI & process box + Reproduce box (badge, the exact `npx vibe-rerun …` command, resource summary from `delta.yaml`, link to `delta.yaml`) + Code & data list.
- Tag pages, author pages (`/@username/`), filter by AI model and by badge.
- Client-side search over a build-time JSON index.
- RSS (site-wide and per author).

## 7. Constraints

- Static hosting only (GitHub Pages); no server, no database in v1.
- Delta is open to anyone who registers (decided by the owner), so image names, GPU types and resource specs can be public, and the Reproduce box links to Delta registration. Readers who don't register can still read and download everything. The site and CI never hold Delta credentials. Posts without a Delta run are allowed: no badge, and their Specs section is marked "self-reported".
- delta-cli rules that the rerun tool must honour: all operations through `delta-cli` (no direct HTTP), one active sandbox per run, always kill, `run-bg` for anything over 60 s.
- Repo size: GitHub Pages and git limits make large datasets/checkpoints out of scope to commit; link them (and fetch them in `setup`).

## 7a. Calls made by Claude (owner to check)

- **References re-checked in CI.** The `verified` flag in `refs.json` is not trusted from a PR: CI re-runs `check-refs` on the changed post (free arXiv/Crossref/Semantic Scholar endpoints, no secret), with results cached by DOI/arXiv id in the repo to limit rate-limit flakiness; a network failure marks the check "retry", not "fail". The claim check (does the source support the sentence?) stays author-side in the skill and is listed on the moderator checklist.
- **Previews without a third-party host.** CI uploads the built post as a downloadable artifact and posts a checklist comment via a `workflow_run` job that never executes PR code with write permissions. The moderator previews locally (`npm run serve`) before merge.
- **Licenses from an allowlist.** Text: CC-BY-4.0 (default) or CC-BY-SA-4.0 / CC0. Code: MIT (default), Apache-2.0, BSD-3-Clause, or CC0. `code_license` is required. Authors confirm they may share the `chat/` excerpts under their AI provider's terms.
- **Posts can be edited after merge; reruns are pinned.** The Reproduce box shows `npx vibe-rerun <post>@<commit>`, pinned to the commit that last changed the post; the post shows "updated <date>" with a link to its history. `authors:` is a list of GitHub usernames (first one owns the folder); any listed author may open PRs touching that folder. (`author:` in 6.1 becomes `authors:`.)

## 8. Left to the builder

- Repo name/location (suggested: new repo `vibe-research`, seeded from `blog/` engine); migrating the Monte Carlo post in as the first example (as `posts/<owner>/monte-carlo-vs-quasi-monte-carlo/`, with a `delta.yaml`).
- Visual design of feed/cards/boxes (Medium-like, keep current post typography).
- Search library, schema validation library, how `vibe-rerun` is distributed (npm package in the repo is fine).
- Exact size limits and file allowlist values.
