# Vibe Research

A static site for AI-assisted research written up like a short paper: Markdown + KaTeX math, figures, callouts, numbered citations that must be machine-verified, an AI & process box, author verification, and a Delta rerun package.

Anyone can contribute a post by pull request: see [CONTRIBUTING.md](CONTRIBUTING.md) for the post format, licenses, limits and review policy.

## Daily use

The easiest path is the Claude Code skill: from any research folder, say **"/publish-vibe-research"** (or "write this up for Vibe Research"). It gathers results, writes the post, verifies references, builds and previews, and asks before creating a Delta sandbox or opening the pull request.

By hand:

```bash
npm install
npm run new -- "My post title"            # scaffold a post folder from templates/post.md
npm run check-refs -- posts/<user>/<slug> # verify refs.json against arXiv / Crossref / Semantic Scholar
npm run serve                             # preview at http://localhost:4321 (drafts shown)
npm run build                             # strict build into dist/
npm run rerun -- posts/<user>/<slug> --record   # run on Delta, pull outputs, write run.json
```

## Writing a post

- `posts/<user>/<slug>/index.md`: front matter (`title`, `date`, `summary`, `tags`, `tldr`, `code`, `draft`, plus `authors`, `ai`, `contribution`, `license`, `code_license`, `author_verification`; see CONTRIBUTING.md) + Markdown.
- Math: `$inline$` and `$$display$$`, rendered at build time with KaTeX.
- Citations: `[@key]` or `[@a; @b]`, with entries in `refs.json` next to `index.md`.
- Figures: `![alt](figure.png "Caption")` on its own line → numbered figure.
- Callouts: `> [!INTUITION]`, `> [!TAKEAWAY]`, `> [!NOTE]`, `> [!WARNING]`, `> [!DEFINITION]`, `> [!EXAMPLE]`.
- Everything else in the post folder (figures, scripts, CSVs) is copied next to the page.
- Code (`.py`, `.jl`, `.r`, `.sh`, `.js`, `.lean`, …), CSV/TSV, JSON and Jupyter notebooks each get a readable HTML page (`<file>.html`) with syntax highlighting, line numbers and `#L10-L20` line links. Links to these files in a post open that page, and the post ends with a "Code & data" list.
- `@include experiment.py#L41-L48` on its own line inserts those lines of the real file, with a link to them in the full file.

`npm run build` fails if a cited key is missing from `refs.json`, a cited reference is not verified, or any math fails to render. Posts with `draft: true` are left out unless you use `npm run build:drafts`.

## Pull requests and CI

- `.github/workflows/pr-check.yml` (**PR checks**, `pull_request`, read-only token): `npm test`, the PR policy (`scripts/check-pr.mjs`: only the author's own `posts/<user>/<slug>/` folders, authors read from the base branch, file-type allowlist, 5 MB/file and 25 MB/post, no active SVG), `check-refs --ci` on each changed post using the base branch's `refcache.json`, and `npm run build:drafts`. It uploads `site-preview` (the built site) and `pr-report` (the checklist).
- `.github/workflows/pr-comment.yml` (`workflow_run` after PR checks): downloads only `pr-report` and creates or updates one checklist comment on the PR. It never checks out or runs PR code.
- `.github/CODEOWNERS`: every merge needs the owner's review. Takedown = revert.

## Deploy (GitHub Pages)

`site.config.json` holds `siteUrl` (`https://seawan.github.io`), `baseUrl` (`/vibe-research/`) and `repo`. In the repo settings, set **Pages → Source** to **GitHub Actions**. Every push to `main` runs `.github/workflows/deploy.yml`: `npm test`, then a strict `npm run build`, then deploy.

## Skill

The skill source is `skills/publish-vibe-research/SKILL.md`, symlinked into `~/.claude/skills/publish-vibe-research` so it works from any folder.
