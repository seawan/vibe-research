// Pull-request policy: which files a PR may touch, and the moderator checklist. Pure: no git or file access.
export const ALLOWED_EXTENSIONS = 'md json yaml yml csv tsv txt py ipynb jl r sh js mjs ts lean c cpp h rs go java m tex bib toml cfg ini png jpg jpeg gif webp svg pdf'.split(' ');
export const LIMITS = { fileBytes: 5_000_000, postBytes: 25_000_000 };
export const MANUAL_ITEMS = ['claims match cited sources', 'AI & contribution statement plausible', 'author verification is specific'];
export const REPORT_MARKER = '<!-- vibe-research-report -->';

const SVG_ACTIVE = /<script|on\w+\s*=|javascript:/i;
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const lower = (a) => (a ?? []).map((s) => String(s).toLowerCase());

// "posts/<user>/<slug>/<file...>" -> { user, slug, id } or null
export function postOf(p) {
  const s = p.split('/');
  if (s.length < 4 || s[0] !== 'posts' || s.some((x) => x === '' || x === '.' || x === '..')) return null;
  return { user: s[1], slug: s[2], id: `${s[1]}/${s[2]}` };
}

// changed: [{ path, size, content?, deleted?, mode? }]; returns a list of violations (empty = OK).
// baseAuthors(id) is null when the post does not exist on the base branch; postBytes(id) is the post's size at head.
export function checkPr({ changed, prAuthor, baseAuthors, headAuthors, postBytes }) {
  const v = [];
  const me = String(prAuthor).toLowerCase();
  const posts = new Map();
  for (const f of changed) {
    const post = postOf(f.path);
    if (!post) { v.push(`${f.path}: outside posts/<user>/<slug>/ (a PR may only change files in a post folder)`); continue; }
    if (!posts.has(post.id)) posts.set(post.id, { ...post, bytes: 0 });
    if (f.deleted) continue;
    posts.get(post.id).bytes += f.size;
    const name = f.path.split('/').pop();
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (f.mode === '120000' || f.mode === '160000') v.push(`${f.path}: symlinks and submodules are not allowed`);
    else if (!ALLOWED_EXTENSIONS.includes(ext)) v.push(`${f.path}: file type ${ext ? `.${ext}` : '(no extension)'} is not allowed (see CONTRIBUTING.md)`);
    if (f.size > LIMITS.fileBytes) v.push(`${f.path}: ${mb(f.size)} is over the ${mb(LIMITS.fileBytes)} per-file limit; link large data instead`);
    if (ext === 'svg' && SVG_ACTIVE.test(f.content ?? '')) v.push(`${f.path}: SVG contains script, event handlers or javascript: URLs`);
  }
  for (const p of posts.values()) {
    const base = baseAuthors(p.id);
    if (base) {
      if (!lower(base).includes(me)) v.push(`posts/${p.id}/: ${prAuthor} is not an author of this post on the base branch (authors: ${base.join(', ') || 'none'})`);
    } else {
      if (p.user.toLowerCase() !== me) v.push(`posts/${p.id}/: a new post must be in your own folder posts/${prAuthor}/`);
      else if (!lower(headAuthors(p.id)).includes(me)) v.push(`posts/${p.id}/: ${prAuthor} must be listed in authors`);
    }
    const total = postBytes ? postBytes(p.id) : p.bytes;
    if (total > LIMITS.postBytes) v.push(`posts/${p.id}/: ${mb(total)} is over the ${mb(LIMITS.postBytes)} per-post limit; link large data instead`);
  }
  return v;
}

// The moderator checklist posted on the PR.
// results: [{ name, outcome }]; posts: [{ id, badge, reasons, refcheck, inBuild }]
export function checklistMd({ pr, violations = [], results = [], posts = [], buildErrors = [], files = [] }) {
  const icon = (o) => ({ success: '✅', failure: '❌', skipped: '⏭️', cancelled: '⏹️' })[o] ?? '❔';
  const out = [`## Vibe Research checks for PR #${pr}`, '', '### Automated checks', ''];
  out.push(`- ${violations.length ? '❌' : '✅'} PR policy (paths, authors, file types, sizes): ${violations.length ? `${violations.length} violation(s)` : 'passed'}`);
  for (const r of results) out.push(`- ${icon(r.outcome)} ${r.name}: ${r.outcome}`);
  if (violations.length) out.push('', '<details open><summary>Policy violations</summary>', '', ...violations.map((m) => `- ${m}`), '', '</details>');
  if (buildErrors.length) out.push('', '<details><summary>Build errors</summary>', '', ...buildErrors.slice(0, 50).map((m) => `- ${m}`), '', '</details>');
  out.push('', '### Changed posts', '');
  if (!posts.length) out.push('_No post folders changed._');
  for (const p of posts) {
    const badge = !p.inBuild ? 'not built' : p.badge ? '✅ Delta-reproducible' : 'no badge';
    out.push(`- \`posts/${p.id}/\` · badge: ${badge} · references: ${p.refcheck}`);
    if (p.inBuild && !p.badge) for (const r of p.reasons ?? []) out.push(`  - ${r}`);
  }
  if (files.length) out.push('', `<details><summary>Changed files (${files.length})</summary>`, '', ...files.map((f) => `- \`${f}\``), '', '</details>');
  out.push('', '### Moderator (manual)', '', ...MANUAL_ITEMS.map((m) => `- [ ] ${m}`), '');
  out.push('Preview: download the `site-preview` artifact from the PR checks run, or check out the PR and run `npm run serve`.', '');
  return out.join('\n');
}
