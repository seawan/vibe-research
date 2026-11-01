// Verify a post's references against arXiv, Crossref and Semantic Scholar.
// Usage: node scripts/check-refs.mjs posts/<user>/<slug> [--fix]
//
// For each entry in refs.json it looks up the paper (by arXiv id, then DOI, then title search),
// compares title / first-author surname / year, and on success writes back
//   verified: true, verified_via, verified_on  (+ any missing doi/arxiv/url/venue)
// The abstract of each match is saved to posts/<user>/<slug>/.refcheck.json so the claim each
// citation supports ("claim" field) can be checked against what the paper actually says.
// --fix overwrites title/authors/year/venue with the canonical metadata when they disagree.
import fs from 'node:fs';
import path from 'node:path';

const UA = { 'User-Agent': 'research-blog-refcheck/1.0 (personal blog reference checker)' };
const argv = process.argv.slice(2);
const FIX = argv.includes('--fix');
const postDir = argv.find((a) => !a.startsWith('--'));
if (!postDir) { console.error('usage: node scripts/check-refs.mjs posts/<user>/<slug> [--fix]'); process.exit(1); }
const refsPath = path.join(postDir, 'refs.json');
const refs = JSON.parse(fs.readFileSync(refsPath, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const surname = (name) => { const n = String(name ?? '').trim(); return norm(n.includes(',') ? n.split(',')[0] : n.split(/\s+/).at(-1)); };

// Dice coefficient over word bigrams + words; robust to punctuation/case differences.
function similarity(a, b) {
  const grams = (s) => { const w = norm(s).split(' '); const g = [...w]; for (let i = 0; i < w.length - 1; i++) g.push(w[i] + ' ' + w[i + 1]); return g; };
  const A = grams(a), B = grams(b);
  if (!A.length || !B.length) return 0;
  const bag = new Map(); for (const g of B) bag.set(g, (bag.get(g) ?? 0) + 1);
  let hit = 0; for (const g of A) if (bag.get(g) > 0) { hit++; bag.set(g, bag.get(g) - 1); }
  return (2 * hit) / (A.length + B.length);
}

async function getJSON(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * 2 ** attempt); continue; }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}
async function getText(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * 2 ** attempt); continue; }
    return res.ok ? res.text() : null;
  }
  return null;
}

// ---------- sources ----------
function parseArxivEntries(xml) {
  const tag = (s, t) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) ?? [])[1]?.replace(/\s+/g, ' ').trim();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    title: tag(e, 'title'),
    authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim()),
    year: Number(tag(e, 'published')?.slice(0, 4)),
    arxiv: tag(e, 'id')?.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, ''),
    doi: tag(e, 'arxiv:doi'),
    abstract: tag(e, 'summary'),
    via: 'arXiv',
  })).filter((e) => e.title && e.title !== 'Error');
}
async function arxivById(id) {
  const xml = await getText(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
  return xml ? parseArxivEntries(xml)[0] ?? null : null;
}
async function arxivByTitle(title) {
  // arXiv returns nothing if a stopword is among the AND-ed terms
  const STOP = new Set(['the', 'for', 'and', 'with', 'from', 'into', 'via', 'are', 'its', 'that', 'this', 'over', 'under', 'all', 'you', 'not', 'how', 'what', 'why', 'when', 'can', 'using', 'towards', 'toward', 'about', 'between', 'through', 'without', 'on', 'of', 'in', 'to', 'is', 'an']);
  const q = norm(title).split(' ').filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 10).map((w) => `ti:${w}`).join(' AND ');
  const xml = await getText(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&max_results=5`);
  return xml ? parseArxivEntries(xml) : [];
}

function fromCrossref(m) {
  const authors = (m.author ?? []).map((a) => (a.given ? `${a.given} ${a.family}` : a.family ?? a.name)).filter(Boolean);
  const dp = (m['published-print'] ?? m['published-online'] ?? m.issued)?.['date-parts']?.[0];
  return {
    title: m.title?.[0],
    authors,
    year: dp?.[0],
    venue: m['container-title']?.[0] || m.publisher,
    doi: m.DOI,
    url: m.URL,
    abstract: m.abstract?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    via: 'Crossref',
  };
}
async function crossrefByDoi(doi) {
  const j = await getJSON(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  return j?.message ? fromCrossref(j.message) : null;
}
async function crossrefByTitle(title, author) {
  const q = new URLSearchParams({ 'query.bibliographic': title, rows: '5' });
  if (author) q.set('query.author', author);
  const j = await getJSON(`https://api.crossref.org/works?${q}`);
  return (j?.message?.items ?? []).map(fromCrossref);
}

async function s2Search(title) {
  const fields = 'title,year,authors,venue,externalIds,abstract,url';
  const j = await getJSON(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=5&fields=${fields}`);
  return (j?.data ?? []).map((p) => ({
    title: p.title, authors: (p.authors ?? []).map((a) => a.name), year: p.year, venue: p.venue,
    doi: p.externalIds?.DOI, arxiv: p.externalIds?.ArXiv, url: p.url, abstract: p.abstract, via: 'Semantic Scholar',
  }));
}

// ---------- matching ----------
function compare(ref, cand) {
  const titleSim = similarity(ref.title, cand.title);
  const authorOk = !ref.authors?.length || !cand.authors?.length || cand.authors.slice(0, 3).some((a) => surname(a) === surname(ref.authors[0]));
  // arXiv preprints often get a later venue year, so allow a small gap
  const yearOk = !ref.year || !cand.year || Math.abs(Number(ref.year) - Number(cand.year)) <= (cand.via === 'arXiv' || ref.arxiv ? 2 : 1);
  return { titleSim, authorOk, yearOk, ok: titleSim >= 0.85 && authorOk && yearOk };
}

async function lookup(ref) {
  const tried = [];
  if (ref.arxiv) { const c = await arxivById(ref.arxiv); if (c) tried.push(c); }
  if (ref.doi) { const c = await crossrefByDoi(ref.doi); if (c) tried.push(c); }
  // An explicit id that resolves to a different paper is a red flag; report it rather than searching around it.
  if (tried.length) return tried.map((c) => ({ cand: c, cmp: compare(ref, c), byId: true }));
  if (!ref.title) return [];
  const pools = [
    () => crossrefByTitle(ref.title, ref.authors?.[0] && surname(ref.authors[0])),
    () => arxivByTitle(ref.title),
    () => s2Search(ref.title),
  ];
  for (const pool of pools) {
    const cands = (await pool().catch(() => [])).map((c) => ({ cand: c, cmp: compare(ref, c), byId: false }));
    cands.sort((a, b) => b.cmp.titleSim - a.cmp.titleSim);
    if (cands[0]?.cmp.ok) return [cands[0]];
    tried.push(...cands.slice(0, 1));
    await sleep(300);
  }
  return tried.map((x) => x).filter(Boolean);
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'GET', headers: UA, redirect: 'follow' });
    return res.ok;
  } catch { return false; }
}

// ---------- main ----------
const today = new Date().toISOString().slice(0, 10);
const report = {};
let failures = 0;

for (const ref of refs) {
  process.stdout.write(`${ref.key.padEnd(24)} `);
  // Non-paper sources (software, datasets, blog posts): verify the link resolves.
  if (ref.type === 'web') {
    const ok = ref.url && (await checkUrl(ref.url));
    Object.assign(ref, ok ? { verified: true, verified_via: 'URL check', verified_on: today } : { verified: false });
    console.log(ok ? `OK    (URL resolves) ${ref.url}` : `FAIL  URL does not resolve: ${ref.url}`);
    if (!ok) failures++;
    report[ref.key] = { status: ok ? 'ok' : 'fail', claim: ref.claim, url: ref.url };
    continue;
  }

  const results = await lookup(ref);
  const good = results.find((r) => r.cmp.ok);
  if (good) {
    const c = good.cand;
    ref.verified = true;
    ref.verified_via = c.via;
    ref.verified_on = today;
    for (const f of ['doi', 'arxiv', 'venue']) if (!ref[f] && c[f]) ref[f] = c[f];
    if (!ref.url && !ref.doi && !ref.arxiv && c.url) ref.url = c.url;
    const diffs = [];
    if (norm(ref.title) !== norm(c.title)) diffs.push(`title -> "${c.title}"`);
    if (ref.year && c.year && Number(ref.year) !== Number(c.year)) diffs.push(`year ${ref.year} -> ${c.year}`);
    if (FIX) { ref.title = c.title; if (c.authors?.length) ref.authors = c.authors; if (c.year) ref.year = c.year; if (c.venue) ref.venue = c.venue; }
    console.log(`OK    via ${c.via} (title sim ${good.cmp.titleSim.toFixed(2)})${diffs.length ? `  note: ${diffs.join('; ')}${FIX ? ' [fixed]' : ''}` : ''}`);
    report[ref.key] = { status: 'ok', via: c.via, matched_title: c.title, matched_authors: c.authors, matched_year: c.year, claim: ref.claim ?? null, abstract: c.abstract ?? null };
  } else {
    failures++;
    ref.verified = false;
    delete ref.verified_via; delete ref.verified_on;
    const best = results.sort((a, b) => b.cmp.titleSim - a.cmp.titleSim)[0];
    if (!best) console.log('FAIL  not found in arXiv / Crossref / Semantic Scholar');
    else {
      const why = [];
      if (best.cmp.titleSim < 0.85) why.push(`title mismatch (sim ${best.cmp.titleSim.toFixed(2)})`);
      if (!best.cmp.authorOk) why.push(`first author not among [${best.cand.authors?.slice(0, 3).join(', ')}]`);
      if (!best.cmp.yearOk) why.push(`year ${ref.year} vs ${best.cand.year}`);
      console.log(`FAIL  ${best.byId ? 'id resolves to a different paper: ' : 'closest match: '}"${best.cand.title}" (${best.cand.year}, ${best.cand.via}) — ${why.join('; ')}`);
    }
    report[ref.key] = { status: 'fail', closest: best ? { title: best.cand.title, authors: best.cand.authors, year: best.cand.year, via: best.cand.via, doi: best.cand.doi, arxiv: best.cand.arxiv } : null, claim: ref.claim ?? null };
  }
  await sleep(400);
}

fs.writeFileSync(refsPath, JSON.stringify(refs, null, 2) + '\n');
fs.writeFileSync(path.join(postDir, '.refcheck.json'), JSON.stringify({ checked_on: today, refs: report }, null, 2) + '\n');
console.log(`\n${refs.length - failures}/${refs.length} references verified. Abstracts saved to ${path.join(postDir, '.refcheck.json')}`);
if (failures) process.exit(1);
