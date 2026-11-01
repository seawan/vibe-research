# Vibe Research Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, Medium-style static site where anyone publishes AI-assisted ("vibe") research through GitHub pull requests, with a fixed paper-like post format, verified references, an author sign-off, and a Delta rerun package that earns a Delta-reproducible badge.

**Architecture:** A new repo `vibe-research`, seeded from the existing single-author engine in `/Users/junwang/math-verification/blog` (Node ESM scripts, Markdown + KaTeX, no framework). Posts move to `posts/<github-user>/<slug>/`. New pure modules in `scripts/lib/` (post schema, Delta spec + badge, page sections, site pages, ref checking, PR policy) are unit-tested with `node:test`; `build.mjs` orchestrates them. `vibe-rerun` is a bin in the same package that drives `delta-cli`; readers run it pinned to a commit with `npx -y github:seawan/vibe-research#<sha> <user>/<slug>`. GitHub Actions: read-only PR checks, a separate `workflow_run` commenter, and Pages deploy on `main`.

**Tech Stack:** Node 22+ (ESM), marked, marked-katex-extension, marked-highlight, highlight.js, gray-matter, js-yaml (new direct dependency), `node:test` + `node:assert/strict`, delta-cli, GitHub Actions + Pages, `gh`.

**Spec:** `docs/superpowers/specs/2026-11-01-vibe-research-platform-design.md` (copied into the new repo in Task 1). Read it before starting any task.

## Global Constraints

- Site title "Vibe Research"; repo `seawan/vibe-research`; `siteUrl` `https://seawan.github.io`, `baseUrl` `/vibe-research/`.
- Static hosting only (GitHub Pages); no server, no database; the site and CI never hold Delta credentials.
- Post folder: `posts/<github-username>/<slug>/`; URL `posts/<user>/<slug>/`; author page `@<user>/`.
- Text licenses allowed: `CC-BY-4.0` (default), `CC-BY-SA-4.0`, `CC0-1.0`. Code licenses allowed: `MIT` (default), `Apache-2.0`, `BSD-3-Clause`, `CC0-1.0`. `code_license` required.
- Required author-written H2 sections, in this order (other H2s may sit between them): one matching `/^(the )?question/i`, one matching `/^(what we did|experiment|method)/i`, one matching `/^results/i`. Specs, Author verification, References and Reproduce are generated and must not be hand-written (an H2 matching `/^(reproduce|references|specs|author verification)/i` is an error).
- `author_verification` is always written by the author; tools (skill, scripts) never fill it in.
- delta-cli rules for anything that creates a sandbox: only through `delta-cli`, at most one live sandbox per run, `run-bg --wait` for the main command, and **always** `sandbox kill` (finally block and SIGINT/SIGTERM).
- File limits: ≤ 5 MB per file, ≤ 25 MB per post. Raw HTML in Markdown is escaped, never rendered.
- No new runtime dependencies besides `js-yaml`; tests use `node:test` only.
- Commit after every task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A Delta run that fails, times out, or is interrupted with Ctrl-C must still kill the sandbox (Task 7: `kills sandbox when run fails` and `kills sandbox on SIGINT`).
2. A fork PR carrying `<script>` in Markdown or in an SVG must not put script on the site (Task 4: `escapes raw html`; Task 8: `rejects svg containing script`).
3. A PR that edits someone else's post, or adds its author to another post's `authors`, must be rejected using the base branch's `authors` (Task 8: `uses base-branch authors`).
4. A reference API outage in CI must yield "retry", while incoming `verified: true` flags are never trusted (Task 6: `ci mode resets incoming verified flags`, `network failure reports retry`).
5. Figure paths written as `./fig.png`, `figs/a.png` or with a `{diagram}` caption marker must match `outputs` after normalization (Task 3: `normalizes figure paths`).

---

### Task 1: New repo seeded from the blog engine, nested post folders, test harness

**Files:**
- Create: `/Users/junwang/math-verification/vibe-research/` (copy of `blog/` without `node_modules`, `dist`, `.git`, `posts/`; include `docs/superpowers/`)
- Modify: `scripts/build.mjs` (post discovery two levels deep; `--posts <dir>` and `--out <dir>` flags), `site.config.json`, `package.json`
- Create: `test/fixtures/posts/alice/hello/index.md` (+ `refs.json` with one verified entry), `test/build.test.mjs`, `test/helpers.mjs`

**Interfaces:**
- Produces: `buildSite({ postsDir, outDir, drafts }) -> { posts, errors, warnings }` exported from `scripts/build.mjs` (CLI wrapper calls it and exits 1 on errors); post object gains `user` and `slug` (`slug` = folder name, `id` = `"<user>/<slug>"`).
- Produces: `test/helpers.mjs` `buildFixture(name = 'posts') -> { outDir, result }` (builds `test/fixtures/<name>` into a temp dir).

- [ ] **Step 1:** Copy the engine, `git init`, set `site.config.json` to `{ "title": "Vibe Research", "author": "Vibe Research contributors", "description": "AI-assisted research, written up like a paper: real runs, verified references, and a rerun package.", "siteUrl": "https://seawan.github.io", "baseUrl": "/vibe-research/", "repo": "seawan/vibe-research" }`; add `"js-yaml": "^4.1.0"` to dependencies, `"test": "node --test test/"` and `"rerun": "node scripts/vibe-rerun.mjs"` to scripts, `"bin": { "vibe-rerun": "scripts/vibe-rerun.mjs" }`, `"engines": { "node": ">=22" }`; `npm install`.
- [ ] **Step 2: Write the failing test** `test/build.test.mjs` › `builds nested user/slug posts`: `buildFixture()` → `result.errors` is `[]`, file `posts/alice/hello/index.html` exists in `outDir`, and `result.posts[0].id === 'alice/hello'`.
- [ ] **Step 3:** Run `npm test` → FAIL (`buildSite` not exported / wrong path).
- [ ] **Step 4:** Implement `buildSite` (refactor the current top-level `build()`; the CLI keeps `--drafts`/`--allow-unverified`).
- [ ] **Step 5:** Run `npm test` → PASS.
- [ ] **Step 6:** Commit `chore: seed vibe-research from blog engine with nested post folders`.

### Task 2: Post schema and required sections

**Files:**
- Create: `scripts/lib/post-schema.mjs`, `test/post-schema.test.mjs`
- Modify: `scripts/build.mjs` (call `validatePost` per post; errors, or warnings when `draft: true`)

**Interfaces:**
- Produces: `validatePost({ fm, markdown, folderUser, files }) -> string[]` (`files` = post-relative posix paths of everything in the folder) (each message prefixed by the field or section it is about).
- Produces: constants `TEXT_LICENSES`, `CODE_LICENSES`, `BOILERPLATE_CHECKS` (lowercase strings: `"verified"`, `"i verified the results"`, `"i checked the results"`, `"looks good"`, `"done"`, `"n/a"`, `"yes"`).

Front-matter rules: `authors` non-empty array of GitHub usernames (`/^[a-z\d](?:[a-z\d-]{0,38})$/i`), `authors[0] === folderUser`; `ai` non-empty array of `{ name, model, role }` with non-empty strings; `contribution` ≥ 40 chars; `license` ∈ `TEXT_LICENSES`; `code_license` ∈ `CODE_LICENSES`; `author_verification` = `{ verified: true, by ∈ authors, date (YYYY-MM-DD, not in the future), checked }` where `checked` ≥ 40 chars, contains no `TODO`, and its trimmed lowercase form is not in `BOILERPLATE_CHECKS`; plus the H2 rules from Global Constraints; at least one code file (extension in `CODE_LANGS` from `viewers.mjs`); at least one `chat/*.md` file or a non-empty `chat_links`. Optional: `chat_links` (array of https URLs), `outputs` (self-reported figure list, see Task 3), `specs` (free text, used only without `run.json`).

- [ ] **Step 1: Write failing tests** in `test/post-schema.test.mjs`, one per rule, starting from a `validFm()` + `validMd()` pair that returns `[]`: `accepts a valid post`; `rejects missing ai`; `rejects authors[0] not folder owner`; `rejects license outside allowlist` (`"GPL-3.0"` as `license`); `rejects missing code_license`; `rejects unverified author_verification` (`verified: false`); `rejects boilerplate checked text` (`"Looks good "`); `rejects verifier not among authors`; `rejects future verification date`; `rejects sections out of order` (Results before Question); `rejects hand-written Reproduce section`; `allows extra sections between required ones`; `requires a code file`; `requires chat excerpt or chat link`.
- [ ] **Step 2:** `npm test` → those tests FAIL.
- [ ] **Step 3:** Implement `validatePost`; wire it into `buildSite`. Update the Task 1 fixture post so it is valid.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: enforce post schema and required sections`.

### Task 3: `delta.yaml`, `run.json`, figure provenance and the badge

**Files:**
- Create: `scripts/lib/delta-spec.mjs`, `test/delta-spec.test.mjs`, `test/fixtures/delta/*.yaml`
- Modify: `scripts/build.mjs` (load `delta.yaml` and `run.json` if present; attach `post.delta = { spec, run, badge, reasons }`; figure errors are build errors)

**Interfaces:**
- Produces: `parseDeltaSpec(text) -> { spec, errors: string[] }` (spec schema exactly as spec §6.2, plus `deployment ∈ {domestic, overseas}`).
- Produces: `figuresIn(markdown) -> { path, diagram: boolean }[]` — paths normalized (strip `./`, posix); `diagram` true when the image title ends with `{diagram}` (the marker is stripped from the rendered caption).
- Produces: `checkFigures({ figures, outputs }) -> string[]` (error for every non-diagram figure not in `outputs`; `outputs` comes from `spec.outputs`, else `fm.outputs`, else `[]`).
- Produces: `computeBadge({ postDir, spec, run, figures }) -> { badge: boolean, reasons: string[] }`.
- Produces: `run.json` shape (written by Task 7): `{ version: 1, execution_id, sandbox: { image, cpu, memory, gpu, gpu_mem, gpu_type, deployment }, started_at, finished_at, duration_s, exit_code, delta_cli_version, packages: string[], result_summary: object|null }`.

Validation: `version === 1`; `sandbox.image` non-empty; `cpu` int ≥ 1; `memory` and `shm_size` match `/^\d+(Gi|Mi)$/` and `shm_size ≤ memory`; `gpu` int ≥ 0; `gpu_mem` int required when `gpu > 0`; `max_life` int 1–1440; `command` non-empty; `timeout` int 1–86400; `upload` relative dir (default `"."`); `outputs` non-empty array; every path relative with no `..` segment. Badge = spec valid, no figure errors, `run.json` present with `exit_code === 0`, `upload` dir exists, the first token after an interpreter in `command` (e.g. `experiment.py` in `python experiment.py`) exists, and every `outputs` file exists. Each failed condition adds a reason; no badge is never an error. (Requiring `run.json` is a plan decision: the Specs section must come from a real run.)

- [ ] **Step 1: Write failing tests:** `parses valid spec`; `rejects shm_size above memory`; `requires gpu_mem when gpu > 0`; `rejects output path with ..`; `rejects unknown deployment`; `normalizes figure paths` (`./figs/a.png` matches output `figs/a.png`); `diagram marker exempts figure and is stripped`; `figure not in outputs is an error`; `badge granted for complete package`; `no badge without run.json` (reason mentions `run.json`); `no badge when an output file is missing`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement the four functions; wire into `buildSite`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: delta.yaml validation, figure provenance and reproducibility badge`.

### Task 4: Post page sections and safe rendering

**Files:**
- Create: `scripts/lib/sections.mjs`, `test/sections.test.mjs`
- Modify: `scripts/build.mjs` (`postPage` order per spec §6.1a; escape raw HTML; `{{result.<key>}}` macro; per-post commit), `static/style.css` (styles for the new boxes and badges), `templates/post.md` (headings: "The question", "Background in plain words", "What we did", "Results", "What this does (and doesn't) show"; no "Reproduce it")

**Interfaces:**
- Consumes: `post.delta` (Task 3), validated `fm` (Task 2).
- Produces: `aiProcessBox(fm) -> html`, `specsSection({ spec, run, fm }) -> html`, `verificationBox(av) -> html`, `reproduceBox({ spec, run, badge, reasons, id, commit, repo }) -> html`, `bylineHtml(authors, rel) -> html` (avatar `https://github.com/<user>.png?size=64`, link to `@<user>/`), `resolveResultMacros(markdown, resultSummary) -> { markdown, errors }`.
- Produces: `postCommit(dir) -> { sha, date }` (`git log -1 --format=%H%n%cs -- <dir>`; `{ sha: 'main', date: null }` when not in git). When `date` is later than `fm.date`, the header shows "Updated <date>" linking to `https://github.com/<repo>/commits/main/posts/<id>`.

Rendering decisions: page order is header → TL;DR → AI & process → body with `specsSection` inserted immediately before the "What we did/Experiment/Method" H2 → Code & data → Author verification → References → Reproduce → disclosure. Specs table rows: Deployment, Image, CPU, Memory, GPU (count × type, MiB each), Run time, Run ID (`execution_id`), Date, Packages (collapsed `<details>`). Without `run.json`: heading "Specs: system & compute (self-reported)" with `fm.specs` text. Reproduce box with badge shows `npx -y github:<repo>#<commit> <id>`, a link to `delta.yaml`, a resource summary, and "Need Delta? Register for delta-cli first."; without badge it lists `reasons`. `{{result.key}}` with an unknown key or no `run.json` is a build error.

- [ ] **Step 1: Write failing tests:** `ai box lists every model and the contribution`; `specs from run.json include execution id and gpu type`; `specs without run.json are marked self-reported`; `verification box shows checked text and verifier`; `reproduce box pins command to commit`; `shows updated date linking to history`; `reproduce box without badge lists reasons`; `result macro substitutes value`; `unknown result macro is an error`; `escapes raw html` (fixture body containing `<script>alert(1)</script>` and `<img onerror=x>` → built page contains neither raw tag); `specs inserted before experiment heading` (index of "Specs" < index of `id="what-we-did"` in built HTML).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `sections.mjs`, a `marked` `html` renderer returning escaped text, and the new `postPage` order.
- [ ] **Step 4:** `npm test` → PASS; `npm run serve` and eyeball the fixture post in light and dark mode.
- [ ] **Step 5:** Commit `feat: paper-format post page with AI, specs, verification and reproduce boxes`.

### Task 5: Medium-like site pages, filters, search, feeds

**Files:**
- Create: `scripts/lib/pages.mjs`, `static/site.js`, `test/pages.test.mjs`, second fixture post `test/fixtures/posts/bob/second/` (no `delta.yaml`, different AI and tag)
- Modify: `scripts/build.mjs` (write the pages below), `static/style.css`

**Interfaces:**
- Produces: `postCard(post, rel) -> html` (title, subtitle, byline, date, reading time, tags, one chip per `ai[].name`, Delta badge when `post.delta.badge`), with `data-ai="claude chatgpt"` (lowercased names) and `data-badge="1|0"`.
- Produces: `homePage(posts)`, `tagPage(tag, posts)`, `authorPage(user, posts)`, `searchIndex(posts) -> [{ id, title, subtitle, summary, tags, authors, ai, url }]`, `feedXml({ title, link, posts })`.
- Output paths: `index.html`, `tags/<tag-slug>/index.html`, `@<user>/index.html`, `@<user>/feed.xml`, `feed.xml`, `search.json`, `about.html`.

`static/site.js` (no library): AI filter chips and a "Delta-reproducible only" toggle that hide cards by `data-*`; a search box that fetches `search.json` once and filters cards by case-insensitive substring over title, subtitle, summary, tags, authors and AI names.

- [ ] **Step 1: Write failing tests:** `home lists posts newest first`; `card shows ai chips and badge only for badged post`; `tag page lists only tagged posts` (tag `"monte carlo"` → `tags/monte-carlo/`); `author page and author feed exist for each author` (co-authored fixture appears on both authors' pages); `search index has one entry per post with authors and ai`; `drafts excluded from home, tags, authors, search and feeds`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `pages.mjs`, `site.js`, styles.
- [ ] **Step 4:** `npm test` → PASS; `npm run serve`, check filters and search by hand at 375 px and desktop widths.
- [ ] **Step 5:** Commit `feat: medium-like feed, tag and author pages, filters, search and feeds`.

### Task 6: Reference checking as a library with CI mode and cache

**Files:**
- Create: `scripts/lib/refcheck.mjs`, `test/refcheck.test.mjs`, `refcache.json` (`{}`)
- Modify: `scripts/check-refs.mjs` (thin CLI over the library; new `--ci` flag)

**Interfaces:**
- Produces: `checkRefs(refs, { fetchImpl = fetch, cache = {}, today, fix = false }) -> Promise<{ refs, abstracts, cache, networkFailed: boolean, unverified: string[] }>` — logic moved unchanged from the current script; cache key `doi:<doi>` | `arxiv:<id>` | `title:<normalized title>`, value = canonical metadata + `verified_via`.
- CLI: `node scripts/check-refs.mjs <postDir> [--fix] [--ci]`. `--ci`: set every incoming `verified` to `false` before checking, read/write `refcache.json` at repo root, write `<postDir>/.refcheck-status` = `ok` | `retry` | `failed`; exit 0 for `ok` and `retry` (prints `::warning::references not re-checked (network), retry the job`), exit 1 for `failed`.

- [ ] **Step 1: Write failing tests** with a stub `fetchImpl` serving canned Crossref/arXiv responses: `verifies doi reference`; `ci mode resets incoming verified flags` (a fake ref claiming `verified: true` with a nonexistent DOI ends `verified: false`); `uses cache without network` (stub throws, cached key still verifies); `network failure reports retry` (`networkFailed === true`, nothing marked verified).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Move the logic into `refcheck.mjs`, injecting `fetchImpl`; rewrite the CLI.
- [ ] **Step 4:** `npm test` → PASS; `node scripts/check-refs.mjs test/fixtures/posts/alice/hello --ci` against the live APIs → status `ok`.
- [ ] **Step 5:** Commit `feat: reference checker library with CI mode and cache`.

### Task 7: `vibe-rerun` (record and rerun on Delta)

**Files:**
- Create: `scripts/vibe-rerun.mjs` (CLI, `#!/usr/bin/env node`), `scripts/lib/rerun.mjs`, `scripts/lib/delta-cli.mjs`, `test/rerun.test.mjs`

**Interfaces:**
- Consumes: `parseDeltaSpec` (Task 3), `run.json` shape (Task 3).
- Produces: `deltaCli(args: string[]) -> Promise<{ json, stdout }>` — spawns `delta-cli`, parses the JSON envelope; for `run-bg --wait` parses SSE `data:` frames and returns the `complete` frame as `json`; throws `DeltaError { type, message }` from `error.type` envelopes.
- Produces: `rerun({ postDir, mode: 'rerun'|'record'|'dry-run', outDir, cli = deltaCli, now = () => new Date() }) -> Promise<{ ok, run, comparison: { files: [{ path, match }], values: [{ key, expected, got, ok }] } }>`.
- CLI: `vibe-rerun <user>/<slug> | <postDir> [--record] [--dry-run] [--out <dir>]`. A `<user>/<slug>` argument resolves to `posts/<user>/<slug>` inside the installed package (this is what makes the `npx github:…#<sha>` command pinned). Default `--out`: `./rerun-<slug>-<YYYYMMDD-HHMMSS>/`.

Sequence (exact delta-cli calls): `sandbox create --image-name <image> --cpu <cpu> --memory <memory> --gpu <gpu> [--gpu-mem] [--gpu-type] [--shm-size] --max-life <max_life> --shared-workspace=false` → `sandbox working-directory <id>` → `sandbox upload <id> --source <postDir>/<upload> --target <wd>` → if `setup`: `sandbox run <id> --command "cd <wd> && <setup>" --timeout 600` → `sandbox run-bg <id> --command "cd <wd> && <command>" --timeout <timeout> --wait` → `sandbox run <id> --command "pip freeze 2>/dev/null || true" --timeout 60` (→ `packages`) → for each output `sandbox pull <id> --source <wd>/<path> --target <dest>/<path>` → `sandbox kill <id>` in `finally`. A SIGINT/SIGTERM handler kills the live sandbox, then exits 130. `--record` pulls into `postDir` and writes `postDir/run.json`; rerun mode pulls into `outDir`, compares sha256 of each output with the published file, and compares `expected.values` against `result_summary` within `rel_tolerance`; exit 0 only when everything matches. `--dry-run` validates the spec and files and prints the commands without calling delta-cli.

- [ ] **Step 1: Write failing tests** with a fake `cli` that records calls and returns canned envelopes: `issues create, upload, run-bg, pull, kill in order`; `kills sandbox when run fails` (run-bg `exit_code: 2` → `ok: false`, last call is `kill`); `kills sandbox when upload throws`; `kills sandbox on SIGINT` (emit `SIGINT` while run-bg is pending → `kill` called once); `never creates a second sandbox` (exactly one `create` per call); `record writes run.json with execution id, resources and packages`; `rerun compares hashes and expected values` (one mismatching file → `ok: false`, match flags correct); `dry-run calls no delta-cli`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `delta-cli.mjs`, `rerun.mjs`, the CLI.
- [ ] **Step 4:** `npm test` → PASS; `npm run rerun -- test/fixtures/posts/alice/hello --dry-run` prints the command list.
- [ ] **Step 5:** Commit `feat: vibe-rerun records and reruns posts on Delta`.

### Task 8: PR policy, CI workflows, moderation files

**Files:**
- Create: `scripts/lib/pr-policy.mjs`, `scripts/check-pr.mjs`, `test/pr-policy.test.mjs`, `.github/workflows/pr-check.yml`, `.github/workflows/pr-comment.yml`, `.github/CODEOWNERS`, `CONTRIBUTING.md`
- Modify: `.github/workflows/deploy.yml` (Node 22; `npm test` before build), `README.md`

**Interfaces:**
- Produces: `checkPr({ changed: [{ path, size, content? }], prAuthor, baseAuthors: (postId) => string[]|null, headAuthors: (postId) => string[] }) -> string[]`.
- Produces: `ALLOWED_EXTENSIONS` = `md json yaml yml csv tsv txt py ipynb jl r sh js mjs ts lean c cpp h rs go java m tex bib toml cfg ini png jpg jpeg gif webp svg pdf` and `LIMITS = { fileBytes: 5_000_000, postBytes: 25_000_000 }`.
- CLI: `node scripts/check-pr.mjs --base <sha> --head <sha> --author <login>` (uses `git diff --name-only`, `git show <base>:<path>` for base authors), writes `pr-report/checklist.md` and exits 1 on any violation.

Rules: every changed path is under `posts/<user>/<slug>/`; for an existing post (present at base) `prAuthor ∈ baseAuthors`; for a new post `prAuthor === <user>` and `prAuthor ∈ headAuthors`; extension allowlisted (case-insensitive); size limits; an `.svg` whose text matches `/<script|on\w+\s*=|javascript:/i` is rejected.

Workflows: `pr-check.yml` on `pull_request` with `permissions: contents: read` — checkout (`fetch-depth: 0`), `npm ci`, `npm test`, `check-pr`, `check-refs --ci` for each changed post dir, `npm run build:drafts`, then upload artifacts `site-preview` (`dist/`) and `pr-report` (`checklist.md` with each check's result, each changed post's badge status and reasons, `.refcheck-status`, the moderator's manual items "claims match cited sources", "AI & contribution statement plausible", "author verification is specific", and the PR number). `pr-comment.yml` on `workflow_run` (`workflows: ["PR checks"]`, `types: [completed]`) with `permissions: pull-requests: write, actions: read` — downloads `pr-report` only, never checks out PR code, and creates or updates one comment marked `<!-- vibe-research-report -->` via `gh`. `CODEOWNERS`: `* @seawan`. `CONTRIBUTING.md`: post format (spec §6.1a), licenses, chat-excerpt permission, size limits, review and takedown (revert) policy, how to get Delta access and run `npm run rerun -- <postDir> --record`.

- [ ] **Step 1: Write failing tests:** `accepts new post by its owner`; `rejects path outside posts`; `rejects editing another user's post`; `uses base-branch authors` (PR adds its author to `authors` of an existing post → rejected); `co-author may edit listed post`; `rejects disallowed extension` (`model.pt`, `page.html`); `rejects file over 5 MB` and `rejects post over 25 MB`; `rejects svg containing script`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `pr-policy.mjs`, `check-pr.mjs`, the workflows and moderation files.
- [ ] **Step 4:** `npm test` → PASS; `npx --yes @action-validator/cli .github/workflows/pr-check.yml` (and the other two) → no errors.
- [ ] **Step 5:** Commit `feat: PR policy checks, CI workflows and contribution rules`.

### Task 9: Authoring skill and post scaffolding

**Files:**
- Create: `skills/publish-vibe-research/SKILL.md`
- Modify: `scripts/new-post.mjs` (creates `posts/<user>/<slug>/` where `<user>` comes from `gh api user --jq .login`, or `--user <login>`; fills `authors`, `license: CC-BY-4.0`, `code_license: MIT`, an `ai: []` stub and `draft: true`), `templates/post.md`, `test/build.test.mjs` (add `new-post scaffolds nested folder`)

**Interfaces:**
- Consumes: every command above: `npm run new`, `npm run rerun -- <dir> --record|--dry-run`, `npm run check-refs -- <dir>`, `npm run serve`, `npm run build:drafts`.

Skill steps (adapted from `blog/skills/publish-research/SKILL.md`, keep its house style and code-cleanup rules): (1) gather results and trace every number to a file; (2) `npm run new`; (3) write `delta.yaml` from the sandbox the author actually used, have the script print its final JSON summary, and run `npm run rerun -- <dir> --record` (asks before creating a sandbox, because it uses the author's Delta quota); (4) write the post in the fixed format, using `{{result.key}}` for headline numbers; (5) ask the author for `ai` entries and the `contribution` statement, never inventing them; (6) save key chat excerpts in `chat/` (author confirms they may share them); (7) verify references (`check-refs`) and check each claim against the saved abstracts; (8) ask the author to verify the results and to write `author_verification.checked` in their own words, and **never write it for them**; (9) preview; (10) fork + branch + `gh pr create` only after the author says yes. Symlink it into `~/.claude/skills/publish-vibe-research`.

- [ ] **Step 1: Write failing test** `new-post scaffolds nested folder`: `node scripts/new-post.mjs --user alice "My Title"` in a temp copy creates `posts/alice/my-title/index.md` whose front matter has `authors: [alice]`, `license: CC-BY-4.0`, `code_license: MIT`, `draft: true`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `new-post.mjs`, update the template, write the skill, and create the symlink.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: publish-vibe-research skill and nested post scaffolding`.

### Task 10: Migrate the Monte Carlo post as the first example (needs the owner)

**Files:**
- Create: `posts/seawan/monte-carlo-vs-quasi-monte-carlo/` (copied from `blog/posts/…`), plus `delta.yaml`, `run.json` (produced by `--record`), `chat/` excerpts
- Modify: its `index.md` (new front matter, headings, `{{result.*}}` macros, drop "Reproduce it"), `experiment.py` (print a final JSON object with the headline numbers, e.g. `qmc_error_262k`, `mc_error_262k`, `slope_rqmc`, `slope_mc`)

- [ ] **Step 1:** Copy the post; change `experiment.py` only to add the final JSON print; run it locally and `diff` `results.csv` against the old one → identical.
- [ ] **Step 2:** Write `delta.yaml` (CPU image from `delta-cli sandbox images`, `cpu: 2`, `memory: 4Gi`, `gpu: 0`, `outputs: [results.csv, error.png]`), then `npm run rerun -- posts/seawan/monte-carlo-vs-quasi-monte-carlo --dry-run` → OK.
- [ ] **Step 3: Owner:** confirm Delta login and the deployment (domestic or overseas); then `npm run rerun -- posts/seawan/monte-carlo-vs-quasi-monte-carlo --record` → `run.json` with `exit_code: 0`, sandbox killed (`delta-cli sandbox list` shows none).
- [ ] **Step 4: Owner:** supply the `ai` entries, the `contribution` statement, the chat excerpts, and `author_verification` in their own words. Until then the post stays `draft: true`.
- [ ] **Step 5:** `npm run build` → 1 post, badge granted; `npm run rerun -- seawan/monte-carlo-vs-quasi-monte-carlo` → all outputs match.
- [ ] **Step 6:** Commit `content: first post, Monte Carlo vs quasi-Monte Carlo`.

### Task 11: Publish the repo and site (needs the owner's go-ahead)

- [ ] **Step 1: Owner:** run `gh auth refresh -s workflow` and confirm creating the **public** repo `seawan/vibe-research`.
- [ ] **Step 2:** `gh repo create seawan/vibe-research --public --source . --push`; `gh api -X POST repos/seawan/vibe-research/pages -f build_type=workflow`.
- [ ] **Step 3:** Watch the deploy run finish (`gh run watch`); open `https://seawan.github.io/vibe-research/` and check home, the post, its Reproduce box, an author page, a tag page, search and `feed.xml`.
- [ ] **Step 4:** Open a test PR from a branch that edits a file outside `posts/` → PR checks fail and the report comment appears; close it without merging.
