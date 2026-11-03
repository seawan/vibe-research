// Pull-request policy: which files a PR may touch, and the moderator checklist. Pure: no git or file access.
export const ALLOWED_EXTENSIONS = 'md json yaml yml csv tsv txt py ipynb jl r sh js mjs ts lean c cpp h rs go java m tex bib toml cfg ini png jpg jpeg gif webp svg pdf'.split(' ');
export const LIMITS = { fileBytes: 5_000_000, postBytes: 25_000_000 };
export const MANUAL_ITEMS = ['claims match cited sources', 'AI & contribution statement plausible', 'author verification is specific'];
export const REPORT_MARKER = '<!-- vibe-research-report -->';

// SVG: allowlist scanner (no script, foreignObject, links, animation, style element, external refs)
export const SVG_ELEMENTS = new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath title desc linearGradient radialGradient stop clipPath mask pattern marker image'.split(' '));
const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NAME = /^[A-Za-z_][\w.:-]*/;

// Returns a reason the SVG is unsafe, or null.
export function svgProblem(text) {
  const t = String(text ?? '');
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(t)) return 'DOCTYPE, ENTITY and xml-stylesheet are not allowed';
  const ref = /&(?!(?:amp|lt|gt|quot|apos);)[^;\s]{0,12};?/.exec(t);
  if (ref) return `character/entity reference ${ref[0]} is not allowed (only &amp; &lt; &gt; &quot; &apos;)`;
  let i = 0;
  while ((i = t.indexOf('<', i)) >= 0) {
    const skip = (open, close) => { const e = t.indexOf(close, i + open.length); return e < 0 ? -1 : e + close.length; };
    if (t.startsWith('<!--', i)) { i = skip('<!--', '-->'); if (i < 0) return 'unclosed comment'; continue; }
    if (t.startsWith('<![CDATA[', i)) { i = skip('<![CDATA[', ']]>'); if (i < 0) return 'unclosed CDATA'; continue; }
    if (t.startsWith('<?', i)) {
      if (!/^<\?xml\s/.test(t.slice(i, i + 6))) return 'processing instructions other than <?xml ...?> are not allowed';
      i = skip('<?', '?>'); if (i < 0) return 'unclosed <?xml'; continue;
    }
    if (t.startsWith('<!', i)) return 'markup declarations are not allowed';
    const closing = t[i + 1] === '/';
    let j = i + (closing ? 2 : 1);
    const name = XML_NAME.exec(t.slice(j))?.[0];
    if (!name) return 'malformed tag';
    if (!SVG_ELEMENTS.has(name)) return `element <${name}> is not allowed`;
    j += name.length;
    if (closing) { const m = /^\s*>/.exec(t.slice(j)); if (!m) return `malformed </${name}>`; i = j + m[0].length; continue; }
    for (;;) {
      const end = /^\s*(\/?>)/.exec(t.slice(j));
      if (end) { j += end[0].length; break; }
      const a = /^\s+([^\s=\/>]+)\s*=\s*("[^"]*"|'[^']*')/.exec(t.slice(j));
      if (!a) return `malformed attributes in <${name}>`;
      const [attr, value] = [a[1], a[2].slice(1, -1)];
      const bad = attrProblem(attr, value);
      if (bad) return `<${name} ${attr}>: ${bad}`;
      j += a[0].length;
    }
    i = j;
  }
  return null;
}

function attrProblem(attr, value) {
  if (/^on/i.test(attr)) return 'event handlers are not allowed';
  if (attr === 'xmlns') return value === SVG_NS ? null : `default namespace must be ${SVG_NS}`;
  if (attr.includes(':') && !/^xmlns:[\w.-]+$/.test(attr) && attr !== 'xlink:href') return 'namespaced attributes are not allowed (except xmlns:* and xlink:href)';
  if (attr === 'style' && /url\s*\(|expression|javascript/i.test(value)) return 'style must not contain url(), expression or javascript';
  if (attr === 'href' || attr === 'xlink:href') {
    const v = value.replace(/[\x00-\x20\x7f]/g, '');
    if (v.startsWith('#')) return null;
    if (!v || /^[a-z][a-z\d+.-]*:/i.test(v) || v.startsWith('/') || v.includes('\\') || v.split(/[?#]/)[0].split('/').includes('..')) return 'links must be #fragments or relative paths inside the post';
  }
  return null;
}
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
// maintainer (repo owner, member or collaborator, from GitHub's author_association) may change files outside posts/.
export function checkPr({ changed, prAuthor, baseAuthors, headAuthors, postBytes, maintainer = false }) {
  const v = [];
  const me = String(prAuthor).toLowerCase();
  const posts = new Map();
  for (const f of changed) {
    const post = postOf(f.path);
    if (!post) { if (!maintainer) v.push(`${f.path}: outside posts/<user>/<slug>/ (a PR may only change files in a post folder)`); continue; }
    if (!posts.has(post.id)) posts.set(post.id, { ...post, bytes: 0 });
    if (f.deleted) continue;
    posts.get(post.id).bytes += f.size;
    const name = f.path.split('/').pop();
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (f.mode === '120000' || f.mode === '160000') v.push(`${f.path}: symlinks and submodules are not allowed`);
    else if (!ALLOWED_EXTENSIONS.includes(ext)) v.push(`${f.path}: file type ${ext ? `.${ext}` : '(no extension)'} is not allowed (see CONTRIBUTING.md)`);
    if (f.size > LIMITS.fileBytes) v.push(`${f.path}: ${mb(f.size)} is over the ${mb(LIMITS.fileBytes)} per-file limit; link large data instead`);
    const svg = ext === 'svg' && svgProblem(f.content);
    if (svg) v.push(`${f.path}: unsafe SVG: ${svg}`);
  }
  for (const p of posts.values()) {
    const base = baseAuthors(p.id);
    if (base) {
      if (!lower(base).includes(me)) v.push(`posts/${p.id}/: ${prAuthor} is not an author of this post on the base branch (authors: ${base.join(', ') || 'none'})`);
    } else {
      if (p.user !== String(prAuthor)) v.push(`posts/${p.id}/: a new post must be in your own folder posts/${prAuthor}/`);
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
