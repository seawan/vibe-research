// Static site builder: posts/<user>/<slug>/index.md (+ refs.json, figures) -> dist/
// Usage: node scripts/build.mjs [--drafts] [--allow-unverified] [--posts <dir>] [--out <dir>] [--summary <json>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import matter from 'gray-matter';
import { validatePost } from './lib/post-schema.mjs';
import { expandInteractive } from './lib/interactive.mjs';
import { parseDeltaSpec, figuresIn, checkFigures, computeBadge, stripDiagram } from './lib/delta-spec.mjs';
import { aiProcessBox, specsSection, verificationBox, reproduceBox, bylineHtml, updatedHtml, resolveResultMacros, postCommit, esc, safeUrl } from './lib/sections.mjs';
import { homePage, searchIndex, feedXml, sitePages, siteRoot } from './lib/pages.mjs';
import { viewerKind, langOf, renderCode, renderCsv, renderNotebook } from './viewers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const base = site.baseUrl.endsWith('/') ? site.baseUrl : site.baseUrl + '/';

// per-build state, reset by buildSite()
let POSTS, INCLUDE_DRAFTS, ALLOW_UNVERIFIED, COMMIT_INFO;
let errors = [];
let warnings = [];

const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

function formatAuthors(authors = []) {
  if (authors.length === 0) return '';
  if (authors.length > 4) return `${authors[0]} et al.`;
  if (authors.length === 1) return authors[0];
  return authors.slice(0, -1).join(', ') + ' and ' + authors.at(-1);
}

function renderBibliography(order, refs) {
  if (order.length === 0) return '';
  const items = order.map((k) => {
    const r = refs[k];
    const links = [];
    if (r.arxiv) links.push(`<a href="https://arxiv.org/abs/${esc(r.arxiv)}">arXiv:${esc(r.arxiv)}</a>`);
    if (r.doi) links.push(`<a href="https://doi.org/${esc(r.doi)}">doi:${esc(r.doi)}</a>`);
    if (r.url && safeUrl(r.url) && !r.arxiv && !r.doi) links.push(`<a href="${esc(r.url)}">link</a>`);
    const badge = r.verified
      ? `<span class="verified" title="Metadata checked against ${esc(r.verified_via)} on ${esc(r.verified_on)}">✓ verified (${esc(r.verified_via)})</span>`
      : `<span class="unverified">unverified</span>`;
    return `<li id="ref-${esc(k)}">${esc(formatAuthors(r.authors))}. <span class="ref-title">${esc(r.title)}</span>.${r.venue ? ` <em>${esc(r.venue)}</em>,` : ''} ${esc(r.year)}. ${links.join(' · ')} ${badge}</li>`;
  });
  return `<section class="references"><h2 id="references">References</h2><ol>${items.join('\n')}</ol>
<p class="ref-note">Every reference above was checked by an automated script against arXiv, Crossref or Semantic Scholar (title, authors, year), and the cited claim was compared against the paper's abstract.</p></section>`;
}

// ---------- markdown ----------
// ctx = { refs, order, slug, lenient } turns on [@key] citations; without it they stay plain text.
function makeMarked(toc, ctx) {
  const marked = new Marked(
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
  );
  marked.use(markedKatex({ throwOnError: false, nonStandard: true, output: 'html' }));
  marked.use({
    extensions: [
      // [@key] or [@a; @b] -> numbered links; numbering follows first appearance. Emitted by marked itself, never raw HTML.
      {
        name: 'cite', level: 'inline',
        start: (src) => (ctx ? src.indexOf('[@') : -1),
        tokenizer(src) {
          const m = ctx && /^\[(@[\w:.-]+(?:\s*;\s*@[\w:.-]+)*)\]/.exec(src);
          return m ? { type: 'cite', raw: m[0], keys: m[1].split(';').map((k) => k.trim().slice(1)) } : undefined;
        },
        renderer({ keys }) {
          const links = keys.map((k) => {
            if (!ctx.refs[k]) {
              (ctx.lenient ? warnings : errors).push(`${ctx.slug}: cited key "${k}" is not in refs.json`);
              return `<a class="cite-missing">?${esc(k)}</a>`;
            }
            if (!ctx.order.includes(k)) ctx.order.push(k);
            return `<a href="#ref-${esc(k)}" title="${esc(ctx.refs[k].title)}">${ctx.order.indexOf(k) + 1}</a>`;
          });
          return `<span class="cite">[${links.join(', ')}]</span>`;
        },
      },
      // caption line emitted by expandIncludes (JSON payload; the link target is sanitised like any other)
      {
        name: 'codecaption', level: 'block',
        start: (src) => src.match(/^@@caption /m)?.index,
        tokenizer(src) {
          const m = /^@@caption ([^\n]+)(?:\n|$)/.exec(src);
          if (!m) return undefined;
          try { const { href, label } = JSON.parse(decodeURIComponent(m[1])); return { type: 'codecaption', raw: m[0], href: String(href), label: String(label) }; } catch { return undefined; }
        },
        renderer: ({ href, label }) => `<p class="code-caption">${safeUrl(href) ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)}</p>\n`,
      },
      // sandboxed figure emitted by expandInteractive: scripts only, opaque origin, no same-origin access
      {
        name: 'interactive', level: 'block',
        start: (src) => src.match(/^@@interactive /m)?.index,
        tokenizer(src) {
          const m = /^@@interactive ([^\n]+)(?:\n|$)/.exec(src);
          if (!m) return undefined;
          try { return { type: 'interactive', raw: m[0], ...JSON.parse(decodeURIComponent(m[1])) }; } catch { return undefined; }
        },
        renderer: ({ doc, height, caption }) => `<figure class="interactive"><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" title="${esc(caption.replace(/[*_`]/g, ''))}" style="height:${Number(height)}px" srcdoc="${esc(doc)}"></iframe><noscript><p>This interactive figure needs JavaScript. The pictures around it show the same results.</p></noscript><figcaption>${marked.parseInline(caption)}</figcaption></figure>\n`,
      },
    ],
    gfm: true,
    renderer: {
      // raw HTML in Markdown (block or inline) is shown as text, never rendered
      html({ text }) { return esc(text); },
      // only http(s), mailto, relative and #fragment URLs; anything else is shown as plain text
      link({ href, tokens }) { return safeUrl(href) ? false : this.parser.parseInline(tokens); },
      image({ href, text }) { return safeUrl(href) ? false : esc(text); },
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        const id = slugify(text);
        if (depth === 2) toc.push({ id, html: inner });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}">#</a>${inner}</h${depth}>\n`;
      },
      // A paragraph holding only an image becomes a numbered figure; the image title is the caption.
      paragraph(token) {
        const t = token.tokens.filter((x) => !(x.type === 'text' && !x.text.trim()));
        if (t.length !== 1 || t[0].type !== 'image' || !safeUrl(t[0].href)) return false;
        const img = t[0];
        const title = stripDiagram(img.title);
        const caption = title ? marked.parseInline(title) : '';
        return `<figure><img src="${esc(img.href)}" alt="${esc(img.text)}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>\n`;
      },
      // > [!NOTE] / [!INTUITION] / [!TAKEAWAY] / [!WARNING] / [!DEFINITION] -> callout box
      blockquote({ tokens }) {
        const html = this.parser.parse(tokens);
        const m = html.match(/^<p>\[!(\w+)\]\s*/);
        if (!m) return `<blockquote>${html}</blockquote>\n`;
        const kind = m[1].toLowerCase();
        const label = { note: 'Note', intuition: 'Intuition', takeaway: 'Takeaway', warning: 'Caveat', definition: 'Definition', example: 'Example' }[kind] ?? m[1];
        return `<aside class="callout callout-${kind}"><div class="callout-label">${label}</div>${html.replace(m[0], '<p>')}</aside>\n`;
      },
    },
  });
  return marked;
}

// ---------- templates ----------
function layout({ title, description, body, depth = 0, url = '' }) {
  const rel = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${url ? `<link rel="canonical" href="${esc(url)}">` : ''}
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="${rel}feed.xml">
<link rel="stylesheet" href="${rel}assets/katex/katex.min.css">
<link rel="stylesheet" href="${rel}assets/hljs-light.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="${rel}assets/hljs-dark.css" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="${rel}assets/style.css">
</head>
<body>
<header class="site-header"><div class="wrap">
  <a class="site-title" href="${rel || './'}">${esc(site.title)}</a>
  <nav><a href="${rel}index.html">Posts</a><a href="${rel}about.html">About</a><a href="${rel}feed.xml">RSS</a></nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site-footer"><div class="wrap">© ${new Date().getFullYear()} ${esc(site.author)} · Built with plain Markdown, KaTeX and checked references.</div></footer>
${body.includes('<figure class="interactive">') ? `<script src="${rel}assets/interactive-host.js" defer></script>\n` : ''}</body>
</html>`;
}

const EXPERIMENT_RE = /^(what we did|experiment|method)/i;

function postPage(post) {
  const fm = post.fm;
  const tldr = fm.tldr?.length
    ? `<aside class="tldr"><div class="callout-label">TL;DR</div><ul>${fm.tldr.map((x) => `<li>${post.inline(x)}</li>`).join('')}</ul></aside>`
    : '';
  const { delta } = post;
  // Specs go right before the experiment H2 (or before the first H2 if there is none)
  const specs = specsSection({ spec: delta.spec, run: delta.run, fm });
  const heads = [...post.html.matchAll(/<h2 id="[^"]*">/g)].map((m) => m.index);
  const at = post.toc.findIndex((t) => EXPERIMENT_RE.test(t.html.replace(/<[^>]+>/g, '').trim()));
  const cut = heads.length ? heads[at >= 0 ? at : 0] : 0;
  const body = post.html.slice(0, cut) + specs + '\n' + post.html.slice(cut);
  const tocItems = [...post.toc];
  tocItems.splice(at >= 0 ? at : 0, 0, { id: 'specs', html: 'Specs: system &amp; compute' });
  const tocHtml = tocItems.map((t) => `<li><a href="#${t.id}">${t.html}</a></li>`).join('')
    + (post.files.length ? '<li><a href="#code-and-data">Code &amp; data</a></li>' : '')
    + '<li><a href="#author-verification">Author verification</a></li>'
    + (post.order.length ? '<li><a href="#references">References</a></li>' : '')
    + '<li><a href="#reproduce">Reproduce</a></li>';
  const toc = `<nav class="toc"><div class="toc-label">Contents</div><ol>${tocHtml}</ol></nav>`;
  const updated = updatedHtml(post.commit.date, fm.date, site.repo, post.id);
  const meta = [
    bylineHtml(fm.authors, '../../../'),
    `<time datetime="${isoDate(fm.date)}">${fmtDate(fm.date)}</time>`,
    updated,
    `${post.minutes} min read`,
    typeof fm.code === 'string' && fm.code ? `<a href="${esc(post.viewerHref(fm.code))}">code &amp; data</a>` : '',
    delta.badge ? '<span class="badge badge-ok" title="Rerunnable with delta-cli">✓ Delta-reproducible</span>' : '',
    fm.draft ? '<span class="draft-badge">DRAFT</span>' : '',
  ].filter(Boolean).join(' · ');
  const tags = (fm.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  return `<article class="post">
<header class="post-header">
  <h1>${post.inline(fm.title)}</h1>
  ${fm.subtitle ? `<p class="subtitle">${post.inline(fm.subtitle)}</p>` : ''}
  <p class="meta">${meta}</p>
  <div class="tags">${tags}</div>
</header>
${tldr}
${aiProcessBox(fm, post.chatFiles)}
${toc}
<div class="post-body">
${body}
</div>
${renderFileList(post.files)}
${verificationBox(fm.author_verification ?? {})}
${renderBibliography(post.order, post.refs)}
${reproduceBox({ spec: delta.spec, run: delta.run, badge: delta.badge, reasons: delta.reasons, id: post.id, commit: post.commit.sha, repo: site.repo })}
${fm.ai_disclosure !== false ? `<p class="disclosure">This is a “vibe research” report: the experiments and the write-up were produced with help from an AI assistant and checked by the author. Numbers come from the linked code and data; references were machine-verified.</p>` : ''}
</article>`;
}

function renderFileList(files) {
  if (!files.length) return '';
  const items = files.map((f) => `<li><a href="${esc(f.rel)}.html"><code>${esc(f.rel)}</code></a> <span class="meta">${esc(f.summary)}</span> · <a class="raw" href="${esc(f.rel)}" download>download</a></li>`);
  return `<section class="files"><h2 id="code-and-data">Code &amp; data</h2><p>Everything needed to check the numbers above. Click a file to read it here, with line numbers.</p><ul>${items.join('\n')}</ul></section>`;
}

// Standalone page for one shipped file (code / CSV / notebook).
function filePage(post, f) {
  const up = '../'.repeat(f.rel.split('/').length - 1) || './';
  return `<article class="file-page">
<p class="crumbs"><a href="${up}">← ${post.inline(post.fm.title)}</a></p>
<header class="file-header">
  <h1><code>${esc(f.rel)}</code></h1>
  <p class="meta">${esc(f.summary)} · <a href="${esc(path.basename(f.rel))}" download>Download raw</a>${f.kind === 'code' ? ' · <button class="copy-btn" type="button">Copy</button>' : ''}</p>
</header>
${f.html}
</article>
<script>
// highlight #L12 or #L12-L20 and support copying the raw file
function markLines() {
  document.querySelectorAll('tr.hl').forEach((r) => r.classList.remove('hl'));
  const m = location.hash.match(/^#L(\\d+)(?:-L(\\d+))?$/);
  if (!m) return;
  const a = +m[1], b = +(m[2] || m[1]);
  for (let i = a; i <= b; i++) document.getElementById('L' + i)?.classList.add('hl');
  document.getElementById('L' + a)?.scrollIntoView({ block: 'center' });
}
addEventListener('hashchange', markLines); markLines();
document.querySelector('.copy-btn')?.addEventListener('click', async (e) => {
  const text = await fetch(${JSON.stringify(path.basename(f.rel))}).then((r) => r.text());
  await navigator.clipboard.writeText(text);
  e.target.textContent = 'Copied'; setTimeout(() => (e.target.textContent = 'Copy'), 1500);
});
</script>`;
}

// ---------- build ----------
function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (!filter(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d, filter) : fs.copyFileSync(s, d);
  }
}

// Files next to index.md that get a readable HTML view (code, CSV, notebooks).
function collectFiles(dir, slug, sub = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.name.startsWith('.') || e.name === '__pycache__' || (!sub && (e.name === 'index.md' || e.name === 'refs.json'))) continue;
    if (e.isDirectory()) { out.push(...collectFiles(dir, slug, rel)); continue; }
    const kind = viewerKind(e.name, fs.statSync(path.join(dir, rel)).size);
    if (kind) out.push({ rel, kind });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// A line "@include experiment.py#L20-L40" becomes that code snippet, with a link to the full file.
function expandIncludes(md, dir, slug) {
  return md.replace(/^@include\s+(\S+?)(?:#L(\d+)(?:-L(\d+))?)?\s*$/gm, (line, file, a, b) => {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) { errors.push(`${slug}: @include target "${file}" not found`); return line; }
    const all = fs.readFileSync(p, 'utf8').replace(/\n$/, '').split('\n');
    const from = a ? +a : 1, to = b ? +b : a ? +a : all.length;
    if (from < 1 || to > all.length || from > to) { errors.push(`${slug}: @include ${file}#L${a}-L${b} is outside the file (${all.length} lines)`); return line; }
    const label = a ? `${file}, lines ${from}–${to}` : file;
    const anchor = a ? `#L${from}-L${to}` : '';
    return `@@caption ${encodeURIComponent(JSON.stringify({ href: `${file}.html${anchor}`, label }))}

\`\`\`${langOf(file)}\n${all.slice(from - 1, to).join('\n')}\n\`\`\`\n`;
  });
}

// every file under a post folder, post-relative posix paths
function listAll(dir, sub = '') {
  return fs.readdirSync(path.join(dir, sub), { withFileTypes: true }).flatMap((e) => {
    const rel = sub ? `${sub}/${e.name}` : e.name;
    return e.isDirectory() ? listAll(dir, rel) : [rel];
  });
}

function loadPost(id) {
  const [user, slug] = id.split('/');
  const dir = path.join(POSTS, user, slug);
  const { data: fm, content } = matter(fs.readFileSync(path.join(dir, 'index.md'), 'utf8'));
  for (const field of ['title', 'date']) if (!fm[field]) errors.push(`${id}: front matter is missing "${field}"`);
  // schema: errors, or warnings for drafts
  for (const m of validatePost({ fm, markdown: content, folderUser: user, files: listAll(dir) })) (fm.draft ? warnings : errors).push(`${id}: ${m}`);
  // wrong-typed list fields would crash rendering: always an error, then rendered as empty
  for (const k of ['authors', 'ai', 'tags', 'chat_links', 'outputs', 'tldr']) {
    if (fm[k] != null && !Array.isArray(fm[k])) { errors.push(`${id}: ${k}: must be a list`); fm[k] = []; }
  }
  if (Array.isArray(fm.ai) && fm.ai.some((a) => !a || typeof a !== 'object')) { errors.push(`${id}: ai: every entry must be a { name, model, role } map`); fm.ai = fm.ai.filter((a) => a && typeof a === 'object'); }
  if (fm.date && isNaN(new Date(fm.date))) { errors.push(`${id}: date: not a valid date`); fm.date = new Date(0); }
  if (!fm.date) fm.date = new Date(0); // already reported as missing; keeps rendering from crashing
  // delta.yaml + run.json, figure provenance: errors, or warnings for drafts
  const report = (m) => (fm.draft ? warnings : errors).push(`${id}: ${m}`);
  let spec = null, run = null, specOk = false;
  if (fs.existsSync(path.join(dir, 'delta.yaml'))) {
    const parsed = parseDeltaSpec(fs.readFileSync(path.join(dir, 'delta.yaml'), 'utf8'));
    spec = parsed.spec; specOk = parsed.errors.length === 0;
    parsed.errors.forEach(report);
  }
  if (fs.existsSync(path.join(dir, 'run.json'))) {
    try { run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8')); } catch (e) { report(`run.json: invalid JSON (${e.message})`); }
  }
  let withIncludes = expandIncludes(content, dir, id);
  const macros = resolveResultMacros(withIncludes, run?.result_summary);
  macros.errors.forEach(report);
  // front-matter text shown on the page and in cards/feeds may use the same {{result.key}} macros
  for (const k of ['title', 'subtitle', 'summary']) {
    if (typeof fm[k] !== 'string') continue;
    const r = resolveResultMacros(fm[k], run?.result_summary);
    r.errors.forEach((m) => report(`${k}: ${m}`));
    fm[k] = r.markdown;
  }
  if (Array.isArray(fm.tldr)) fm.tldr = fm.tldr.map((x) => {
    if (typeof x !== 'string') return x;
    const r = resolveResultMacros(x, run?.result_summary);
    r.errors.forEach((m) => report(`tldr: ${m}`));
    return r.markdown;
  });
  withIncludes = expandInteractive(macros.markdown, { dir, outputs: Array.isArray(spec?.outputs) ? spec.outputs : fm.outputs ?? [], report });
  const figures = figuresIn(withIncludes); // include-expanded, as rendered
  checkFigures({ figures, outputs: Array.isArray(spec?.outputs) ? spec.outputs : fm.outputs ?? [], upload: typeof spec?.upload === 'string' ? spec.upload : '.' }).forEach(report);
  const delta = { spec: specOk ? spec : null, run, ...computeBadge({ postDir: dir, spec: specOk ? spec : null, run, figures }) };
  const refsPath = path.join(dir, 'refs.json');
  let refList = [];
  if (fs.existsSync(refsPath)) {
    try { refList = JSON.parse(fs.readFileSync(refsPath, 'utf8')); } catch (e) { errors.push(`${id}: refs.json: invalid JSON (${e.message})`); }
    if (!Array.isArray(refList)) { errors.push(`${id}: refs.json: must be a list of references`); refList = []; }
    refList = refList.filter((r) => r && typeof r === 'object' && typeof r.key === 'string');
  }
  const refs = Object.fromEntries(refList.map((r) => [r.key, r]));

  const files = collectFiles(dir, id);
  const toc = [];
  const order = [];
  const marked = makeMarked(toc, { refs, order, slug: id, lenient: fm.draft || ALLOW_UNVERIFIED });
  // links to shipped files open their readable HTML view; the raw file stays downloadable from there
  const viewable = new Set(files.map((f) => f.rel));
  const viewerHref = (href) => (viewable.has(href.replace(/^\.\//, '')) ? href.replace(/^\.\//, '') + '.html' : href);
  const html = marked.parse(withIncludes)
    .replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>')
    .replace(/href="([^"#?]+)"/g, (m, href) => `href="${viewerHref(href)}"`);
  for (const k of order) {
    if (!refs[k].verified) (fm.draft || ALLOW_UNVERIFIED ? warnings : errors).push(`${id}: reference "${k}" is not verified (run: npm run check-refs -- posts/${id})`);
  }
  for (const r of refList) if (!order.includes(r.key)) warnings.push(`${id}: reference "${r.key}" is in refs.json but never cited`);
  const nKatexErr = (html.match(/class="katex-error"/g) ?? []).length;
  if (nKatexErr) errors.push(`${id}: ${nKatexErr} math expression(s) failed to render (search for katex-error in dist/posts/${id}/index.html)`);
  const words = content.replace(/\$\$[\s\S]*?\$\$|```[\s\S]*?```/g, '').split(/\s+/).length;
  const inline = (s) => makeMarked([]).parseInline(String(s ?? ''));
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f.rel), 'utf8');
    try {
      Object.assign(f, f.kind === 'csv' ? renderCsv(text, f.rel) : f.kind === 'notebook' ? renderNotebook(text, (s) => makeMarked([]).parse(s)) : renderCode(text, langOf(f.rel)));
    } catch (e) {
      warnings.push(`${id}: could not render ${f.rel} (${e.message}); it is still downloadable`);
      f.skip = true;
    }
  }
  const shown = files.filter((f) => !f.skip);
  const chatFiles = listAll(dir).filter((f) => /^chat\/[^/]+\.md$/i.test(f)).sort();
  return { id, user, slug, dir, fm, delta, commit: COMMIT_INFO(dir), chatFiles, html, toc, order, refs, inline, viewerHref, files: shown, minutes: Math.max(1, Math.round(words / 220)) };
}

// Build every post under postsDir/<user>/<slug>/ into outDir. Never exits; returns { posts, errors, warnings }.
export function buildSite({ postsDir = path.join(ROOT, 'posts'), outDir = path.join(ROOT, 'dist'), drafts = false, allowUnverified = false, commitInfo = postCommit } = {}) {
  POSTS = postsDir; INCLUDE_DRAFTS = drafts; ALLOW_UNVERIFIED = allowUnverified; COMMIT_INFO = commitInfo;
  errors = []; warnings = [];
  const DIST = outDir;
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
  copyDir(path.join(ROOT, 'node_modules/katex/dist'), path.join(DIST, 'assets/katex'), (n) => !n.endsWith('.js') && !n.endsWith('.mjs') && n !== 'contrib' && n !== 'README.md');
  fs.copyFileSync(path.join(ROOT, 'node_modules/highlight.js/styles/github.min.css'), path.join(DIST, 'assets/hljs-light.css'));
  fs.copyFileSync(path.join(ROOT, 'node_modules/highlight.js/styles/github-dark.min.css'), path.join(DIST, 'assets/hljs-dark.css'));
  copyDir(path.join(ROOT, 'static'), path.join(DIST, 'assets'));

  const subdirs = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort() : []);
  const ids = subdirs(POSTS).flatMap((u) => subdirs(path.join(POSTS, u)).filter((s) => fs.existsSync(path.join(POSTS, u, s, 'index.md'))).map((s) => `${u}/${s}`));
  // last-resort guard: an unexpected crash in one post is that post's error, not the whole build's
  const posts = ids.map((id) => { try { return loadPost(id); } catch (e) { errors.push(`${id}: could not be built (${e.message})`); return null; } }).filter(Boolean)
    .filter((p) => INCLUDE_DRAFTS || !p.fm.draft)
    .sort((a, b) => new Date(b.fm.date) - new Date(a.fm.date));

  for (const p of posts) {
    try { writePost(p); } catch (e) { errors.push(`${p.id}: could not be rendered (${e.message})`); }
  }
  function writePost(p) {
    const out = path.join(DIST, 'posts', p.user, p.slug);
    // copy figures/data next to the post, skipping sources and hidden check reports
    copyDir(p.dir, out, (n) => !n.startsWith('.') && n !== 'index.md' && n !== 'refs.json');
    const url = site.siteUrl.replace(/\/$/, '') + base + `posts/${p.id}/`;
    const description = p.fm.summary ?? site.description;
    fs.writeFileSync(path.join(out, 'index.html'), layout({ title: `${p.fm.title} · ${site.title}`, description, body: postPage(p), depth: 3, url }));
    for (const f of p.files) {
      fs.writeFileSync(path.join(out, f.rel + '.html'), layout({ title: `${f.rel} · ${p.fm.title}`, description: `${f.rel} from “${p.fm.title}”`, body: filePage(p, f), depth: 2 + f.rel.split('/').length }));
    }
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), layout({ title: site.title, description: site.description, body: homePage(posts) }));
  const aboutPath = path.join(ROOT, 'about.md');
  const about = fs.existsSync(aboutPath) ? makeMarked([]).parse(matter(fs.readFileSync(aboutPath, 'utf8')).content) : '<p>About this blog.</p>';
  fs.writeFileSync(path.join(DIST, 'about.html'), layout({ title: `About · ${site.title}`, description: site.description, body: `<article class="post"><div class="post-body">${about}</div></article>` }));
  fs.writeFileSync(path.join(DIST, 'feed.xml'), feedXml({ title: site.title, link: siteRoot, posts }));
  fs.writeFileSync(path.join(DIST, 'search.json'), JSON.stringify(searchIndex(posts)));
  for (const pg of sitePages(posts)) {
    const f = path.join(DIST, pg.file);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, pg.raw ?? layout({ title: pg.title, description: site.description, body: pg.body, depth: pg.depth, url: pg.url }));
  }
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  return { posts, errors, warnings };
}

// CLI wrapper: the only place that prints and exits.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? path.resolve(argv[i + 1]) : undefined; };
  const result = buildSite({ postsDir: opt('--posts'), outDir: opt('--out'), drafts: argv.includes('--drafts'), allowUnverified: argv.includes('--allow-unverified') });
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  // --summary <file>: badge status per post, for the PR checklist (written even when the build fails)
  const summaryPath = opt('--summary');
  if (summaryPath) {
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    const posts = result.posts.map((p) => ({ id: p.id, badge: !!p.delta.badge, reasons: p.delta.reasons ?? [] }));
    fs.writeFileSync(summaryPath, JSON.stringify({ errors: result.errors, warnings: result.warnings, posts }, null, 2) + '\n');
  }
  if (result.errors.length) {
    for (const e of result.errors) console.error(`error: ${e}`);
    console.error(`\nBuild failed with ${result.errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`Built ${result.posts.length} post(s) into ${path.relative(process.cwd(), opt('--out') ?? path.join(ROOT, 'dist')) || '.'}`);
}
