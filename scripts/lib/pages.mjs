// Home, tag and author pages, search index and RSS feeds. Pure: callers pass already-loaded posts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, bylineHtml, list as asList } from './sections.mjs';

const site = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../site.config.json'), 'utf8'));
export const siteRoot = site.siteUrl.replace(/\/$/, '') + (site.baseUrl.endsWith('/') ? site.baseUrl : site.baseUrl + '/');

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);
// plain text for search.json / RSS: the raw front-matter string (escaped once at the point of use)
const plain = (s) => String(s ?? '');
const aiToken = (n) => String(n).toLowerCase().trim().replace(/\s+/g, '-');

// "monte carlo" -> "monte-carlo"; empty result means the tag has no page
export const tagSlug = (t) => String(t).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
// drafts never appear in listings
const listed = (posts) => posts.filter((p) => !p.fm.draft);
const newestFirst = (posts) => [...posts].sort((a, b) => new Date(b.fm.date) - new Date(a.fm.date));

// rel = path prefix back to the site root ('' home, '../' author page, '../../' tag page)
export function postCard(post, rel = '') {
  const { fm } = post;
  const ai = asList(fm.ai).map((a) => a?.name);
  const tags = asList(fm.tags).filter((t) => tagSlug(t)).map((t) => `<a class="tag" href="${esc(rel)}tags/${esc(tagSlug(t))}/">${esc(t)}</a>`).join('');
  const chips = ai.map((n) => `<span class="ai-chip">${esc(n)}</span>`).join('');
  return `<li class="post-item" data-id="${esc(post.id)}" data-ai="${esc(ai.map(aiToken).join(' '))}" data-badge="${post.delta?.badge ? 1 : 0}">
  <a class="post-link" href="${esc(rel)}posts/${esc(post.id)}/">${post.inline(fm.title)}</a>
  ${fm.subtitle ? `<p class="post-subtitle">${post.inline(fm.subtitle)}</p>` : ''}
  <div class="meta">${bylineHtml(fm.authors, rel)} · <time datetime="${isoDate(fm.date)}">${fmtDate(fm.date)}</time> · ${post.minutes} min read${post.delta?.badge ? ' · <span class="badge badge-ok" title="Rerunnable with delta-cli">✓ Delta-reproducible</span>' : ''}</div>
  <div class="card-chips">${chips}${tags}</div>
</li>`;
}

function filterBar(posts, rel) {
  const names = new Map();
  for (const p of posts) for (const a of asList(p.fm.ai)) if (a?.name) names.set(aiToken(a.name), a.name);
  const chips = [...names].map(([tok, n]) => `<button type="button" class="filter-chip" data-ai-filter="${esc(tok)}" aria-pressed="false">${esc(n)}</button>`).join('');
  return `<div class="filters" data-search-url="${esc(rel)}search.json">
  <input type="search" class="search-box" placeholder="Search title, summary, tags, authors, AI…" aria-label="Search posts">
  <div class="filter-row">${chips}<label class="badge-toggle"><input type="checkbox" class="badge-only"> Delta-reproducible only</label></div>
  <p class="no-results" hidden>No posts match.</p>
</div>`;
}

const list = (posts, rel) => `<ul class="post-list">${posts.map((p) => postCard(p, rel)).join('\n') || '<li class="empty">No posts yet.</li>'}</ul>`;
const script = (rel) => `<script src="${esc(rel)}assets/site.js" defer></script>`;

export function homePage(posts) {
  const ps = newestFirst(listed(posts));
  return `<section class="intro"><h1>${esc(site.title)}</h1><p>${esc(site.description)}</p></section>
${filterBar(ps, '')}
${list(ps, '')}
${script('')}`;
}

// tag = display name; the page lives at tags/<slug>/ (depth 2)
export function tagPage(tag, posts) {
  const ps = newestFirst(listed(posts));
  return `<section class="intro"><h1><span class="hash">#</span>${esc(tag)}</h1><p>${ps.length} post${ps.length === 1 ? '' : 's'} tagged “${esc(tag)}”.</p></section>
${filterBar(ps, '../../')}
${list(ps, '../../')}
${script('../../')}`;
}

// author page lives at @<user>/ (depth 1)
export function authorPage(user, posts) {
  const ps = newestFirst(listed(posts));
  return `<section class="intro author-head"><img class="avatar avatar-lg" src="https://github.com/${esc(user)}.png?size=128" alt="" width="64" height="64">
<div><h1>@${esc(user)}</h1><p>${ps.length} post${ps.length === 1 ? '' : 's'} · <a href="https://github.com/${esc(user)}" rel="noopener">GitHub</a> · <a href="feed.xml">RSS</a></p></div></section>
${filterBar(ps, '../')}
${list(ps, '../')}
${script('../')}`;
}

export function searchIndex(posts) {
  return newestFirst(listed(posts)).map((p) => ({
    id: p.id,
    title: plain(p.fm.title),
    subtitle: plain(p.fm.subtitle),
    summary: plain(p.fm.summary),
    tags: asList(p.fm.tags),
    authors: asList(p.fm.authors),
    ai: asList(p.fm.ai).map((a) => a?.name),
    url: `posts/${p.id}/`,
  }));
}

// RSS 2.0; link is the absolute URL of the page the feed belongs to
export function feedXml({ title, link, posts, description = site.description }) {
  const items = newestFirst(listed(posts)).map((p) => {
    const u = `${siteRoot}posts/${p.id}/`;
    return `<item><title>${esc(plain(p.fm.title))}</title><link>${esc(u)}</link><guid>${esc(u)}</guid><pubDate>${new Date(p.fm.date).toUTCString()}</pubDate><description>${esc(plain(p.fm.summary))}</description></item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${esc(title)}</title><link>${esc(link)}</link><description>${esc(description)}</description>
${items}
</channel></rss>`;
}

// all listing pages as { path, title, description, body, depth, ... } plus data files, keyed for the builder
export function sitePages(posts) {
  const ps = listed(posts);
  const out = [];
  const tags = new Map(), authors = new Map();
  const add = (m, k, name, p) => { if (!m.has(k)) m.set(k, { name, posts: [] }); m.get(k).posts.push(p); };
  for (const p of ps) {
    for (const t of asList(p.fm.tags)) if (tagSlug(t)) add(tags, tagSlug(t), t, p);
    for (const a of asList(p.fm.authors)) add(authors, a, a, p);
  }
  for (const [slug, { name, posts: tp }] of tags) out.push({ file: `tags/${slug}/index.html`, title: `#${name} · ${site.title}`, depth: 2, body: tagPage(name, tp), url: `${siteRoot}tags/${slug}/` });
  for (const [user, { posts: ap }] of authors) {
    out.push({ file: `@${user}/index.html`, title: `@${user} · ${site.title}`, depth: 1, body: authorPage(user, ap), url: `${siteRoot}@${user}/` });
    out.push({ file: `@${user}/feed.xml`, raw: feedXml({ title: `${user} · ${site.title}`, link: `${siteRoot}@${user}/`, posts: ap }) });
  }
  return out;
}
