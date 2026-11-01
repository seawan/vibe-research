# Vibe Research Notes

A minimal static blog for plain-language technical reports: Markdown + KaTeX math, figures, callouts, and numbered citations that must be machine-verified before a post can be published.

## Daily use

The easiest path is the Claude Code skill: from any research folder, say **"/publish-research"** (or "write this up for my blog"). It gathers results, writes the post, verifies references, builds and previews, and asks before publishing.

By hand:

```bash
npm install
npm run new -- "My post title"            # scaffold posts/<slug>/ from templates/post.md
npm run check-refs -- posts/<slug>        # verify refs.json against arXiv / Crossref / Semantic Scholar
npm run serve                             # preview at http://localhost:4321 (drafts shown)
npm run build                             # strict build into dist/
```

## Writing a post

- `posts/<slug>/index.md`: front matter (`title`, `date`, `summary`, `tags`, `tldr`, `code`, `draft`) + Markdown.
- Math: `$inline$` and `$$display$$`, rendered at build time with KaTeX.
- Citations: `[@key]` or `[@a; @b]`, with entries in `posts/<slug>/refs.json`.
- Figures: `![alt](figure.png "Caption")` on its own line → numbered figure.
- Callouts: `> [!INTUITION]`, `> [!TAKEAWAY]`, `> [!NOTE]`, `> [!WARNING]`, `> [!DEFINITION]`, `> [!EXAMPLE]`.
- Everything else in the post folder (figures, scripts, CSVs) is copied next to the page.
- Code (`.py`, `.jl`, `.r`, `.sh`, `.js`, `.lean`, …), CSV/TSV, JSON and Jupyter notebooks each get a readable HTML page (`<file>.html`) with syntax highlighting, line numbers and `#L10-L20` line links. Links to these files in a post open that page, and the post ends with a "Code & data" list.
- `@include experiment.py#L41-L48` on its own line inserts those lines of the real file, with a link to them in the full file.

`npm run build` fails if a cited key is missing from `refs.json`, a cited reference is not verified, or any math fails to render. Posts with `draft: true` are left out unless you use `npm run build:drafts`.

## Deploy (GitHub Pages)

1. Create a GitHub repo (e.g. `<you>.github.io` for a root site, or any name for `https://<you>.github.io/<repo>/`).
2. Edit `site.config.json`: `siteUrl` = `https://<you>.github.io`, `baseUrl` = `/` or `/<repo>/`; also check `title` and `author`.
3. In the repo settings, set **Pages → Source** to **GitHub Actions**.
4. Push to `main`; `.github/workflows/deploy.yml` builds and deploys.

## Skill

The skill source is `skills/publish-research/SKILL.md`, symlinked into `~/.claude/skills/publish-research` so it works from any folder.
