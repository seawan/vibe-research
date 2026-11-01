// Reference checking library: look refs up on arXiv / Crossref / Semantic Scholar, compare title /
// first-author surname / year, and report verified metadata. Network access goes through an injected fetchImpl.
const UA = { 'User-Agent': 'research-blog-refcheck/1.0 (personal blog reference checker)' };

class NetError extends Error {} // fetch threw, or 429/5xx persisted: a lookup we could not complete (not a "not found")

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
function lookupApis({ fetchImpl, sleep, retryBase }) {
  async function get(url, read) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let res;
      try { res = await fetchImpl(url, { headers: UA }); } catch (e) { throw new NetError(String(e?.message ?? e)); }
      if (res.status === 429 || res.status >= 500) { await sleep(retryBase * 2 ** attempt); continue; }
      return res.ok ? read(res) : null;
    }
    throw new NetError(`gave up on ${url}`);
  }
  const getJSON = (url) => get(url, (r) => r.json());
  const getText = (url) => get(url, (r) => r.text());

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

  return { arxivById, arxivByTitle, crossrefByDoi, crossrefByTitle, s2Search };
}

// ---------- matching ----------
function compare(ref, cand) {
  const titleSim = similarity(ref.title, cand.title);
  const authorOk = !ref.authors?.length || !cand.authors?.length || cand.authors.slice(0, 3).some((a) => surname(a) === surname(ref.authors[0]));
  // arXiv preprints often get a later venue year, so allow a small gap
  const yearOk = !ref.year || !cand.year || Math.abs(Number(ref.year) - Number(cand.year)) <= (cand.via === 'arXiv' || ref.arxiv ? 2 : 1);
  return { titleSim, authorOk, yearOk, ok: titleSim >= 0.85 && authorOk && yearOk };
}

const cacheKeys = (ref) => [ref.arxiv && `arxiv:${ref.arxiv}`, ref.doi && `doi:${ref.doi}`, ref.title && `title:${norm(ref.title)}`].filter(Boolean);
const fromCache = (v) => ({ ...v, via: v.verified_via });
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

// refs: array of ref objects (mutated). Returns { refs, abstracts, cache, networkFailed, networkFailedKeys, unverified }.
export async function checkRefs(refs, { fetchImpl = fetch, cache = {}, today = new Date().toISOString().slice(0, 10), fix = false, log = () => {}, fast = false } = {}) {
  const sleep = (ms) => (fast ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
  const api = lookupApis({ fetchImpl, sleep, retryBase: 1500 });
  const outCache = { ...cache };
  const abstracts = {};
  const unverified = [];
  const networkFailedKeys = [];

  // Returns { results, net } where net = a lookup failed on the network and nothing matched.
  async function lookup(ref) {
    const tried = [];
    let net = false;
    const attempt = async (fn) => { try { return await fn(); } catch (e) { if (e instanceof NetError) { net = true; return null; } throw e; } };
    for (const [field, fn] of [['arxiv', api.arxivById], ['doi', api.crossrefByDoi]]) {
      if (!ref[field]) continue;
      const cached = cache[`${field}:${ref[field]}`];
      const c = cached ? fromCache(cached) : await attempt(() => fn(ref[field]));
      if (c) tried.push(c);
    }
    // An explicit id that resolves to a different paper is a red flag; report it rather than searching around it.
    if (tried.length) return { results: tried.map((c) => ({ cand: c, cmp: compare(ref, c), byId: true })), net: false };
    if (net) return { results: [], net };
    if (!ref.title) return { results: [], net: false };
    const tc = cache[`title:${norm(ref.title)}`];
    if (tc) { const c = fromCache(tc); return { results: [{ cand: c, cmp: compare(ref, c), byId: false }], net: false }; }
    const pools = [
      () => api.crossrefByTitle(ref.title, ref.authors?.[0] && surname(ref.authors[0])),
      () => api.arxivByTitle(ref.title),
      () => api.s2Search(ref.title),
    ];
    for (const pool of pools) {
      const cands = ((await attempt(pool)) ?? []).map((c) => ({ cand: c, cmp: compare(ref, c), byId: false }));
      cands.sort((a, b) => b.cmp.titleSim - a.cmp.titleSim);
      if (cands[0]?.cmp.ok) return { results: [cands[0]], net: false };
      tried.push(...cands.slice(0, 1));
      await sleep(300);
    }
    return { results: tried, net };
  }

  async function checkUrl(url) { // true | false | 'net'
    try {
      const res = await fetchImpl(url, { method: 'GET', headers: UA, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) return 'net';
      return !!res.ok;
    } catch { return 'net'; }
  }

  for (const ref of refs) {
    const line = (msg) => log(`${ref.key.padEnd(24)} ${msg}`);
    const markNet = () => { ref.verified = false; delete ref.verified_via; delete ref.verified_on; networkFailedKeys.push(ref.key); unverified.push(ref.key); };
    // Non-paper sources (software, datasets, blog posts): verify the link resolves.
    if (ref.type === 'web') {
      const r = ref.url ? await checkUrl(ref.url) : false;
      if (r === 'net') { markNet(); line(`NET   could not reach ${ref.url}`); abstracts[ref.key] = { status: 'fail', claim: ref.claim, url: ref.url }; continue; }
      const ok = r;
      Object.assign(ref, ok ? { verified: true, verified_via: 'URL check', verified_on: today } : { verified: false });
      if (!ok) { delete ref.verified_via; delete ref.verified_on; }
      line(ok ? `OK    (URL resolves) ${ref.url}` : `FAIL  URL does not resolve: ${ref.url}`);
      if (!ok) unverified.push(ref.key);
      abstracts[ref.key] = { status: ok ? 'ok' : 'fail', claim: ref.claim, url: ref.url };
      continue;
    }

    const { results, net } = await lookup(ref);
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
      if (fix) { ref.title = c.title; if (c.authors?.length) ref.authors = c.authors; if (c.year) ref.year = c.year; if (c.venue) ref.venue = c.venue; }
      line(`OK    via ${c.via} (title sim ${good.cmp.titleSim.toFixed(2)})${diffs.length ? `  note: ${diffs.join('; ')}${fix ? ' [fixed]' : ''}` : ''}`);
      abstracts[ref.key] = { status: 'ok', via: c.via, matched_title: c.title, matched_authors: c.authors, matched_year: c.year, claim: ref.claim ?? null, abstract: c.abstract ?? null };
      const canon = clean({ title: c.title, authors: c.authors, year: c.year, venue: c.venue, doi: c.doi, arxiv: c.arxiv, url: c.url, abstract: c.abstract, verified_via: c.via });
      for (const k of cacheKeys(ref)) outCache[k] = sortObj(canon);
      for (const k of [c.doi && `doi:${c.doi}`, c.arxiv && `arxiv:${c.arxiv}`]) if (k && !outCache[k]) outCache[k] = sortObj(canon);
    } else if (net) {
      markNet();
      line('NET   network failure, not checked');
      abstracts[ref.key] = { status: 'fail', claim: ref.claim ?? null, closest: null };
    } else {
      unverified.push(ref.key);
      ref.verified = false;
      delete ref.verified_via; delete ref.verified_on;
      const best = results.sort((a, b) => b.cmp.titleSim - a.cmp.titleSim)[0];
      if (!best) line('FAIL  not found in arXiv / Crossref / Semantic Scholar');
      else {
        const why = [];
        if (best.cmp.titleSim < 0.85) why.push(`title mismatch (sim ${best.cmp.titleSim.toFixed(2)})`);
        if (!best.cmp.authorOk) why.push(`first author not among [${best.cand.authors?.slice(0, 3).join(', ')}]`);
        if (!best.cmp.yearOk) why.push(`year ${ref.year} vs ${best.cand.year}`);
        line(`FAIL  ${best.byId ? 'id resolves to a different paper: ' : 'closest match: '}"${best.cand.title}" (${best.cand.year}, ${best.cand.via}) — ${why.join('; ')}`);
      }
      abstracts[ref.key] = { status: 'fail', closest: best ? { title: best.cand.title, authors: best.cand.authors, year: best.cand.year, via: best.cand.via, doi: best.cand.doi, arxiv: best.cand.arxiv } : null, claim: ref.claim ?? null };
    }
    await sleep(400);
  }
  return { refs, abstracts, cache: sortObj(outCache), networkFailed: networkFailedKeys.length > 0, networkFailedKeys, unverified };
}
