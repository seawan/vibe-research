// Verify a post's references against arXiv, Crossref and Semantic Scholar.
// Usage: node scripts/check-refs.mjs posts/<user>/<slug> [--fix] [--ci] [--cache <path>]
//
// For each entry in refs.json it looks up the paper (by arXiv id, then DOI, then title search),
// compares title / first-author surname / year, and on success writes back
//   verified: true, verified_via, verified_on  (+ any missing doi/arxiv/url/venue)
// The abstract of each match is saved to <postDir>/.refcheck.json so the claim each
// citation supports ("claim" field) can be checked against what the paper actually says.
// --fix overwrites title/authors/year/venue with the canonical metadata when they disagree.
// --ci never trusts incoming `verified` flags, uses refcache.json at the repo root, and writes
//   <postDir>/.refcheck-status = ok | retry | failed (exit 1 only for failed).
// --cache <path> reads/writes the cache there instead (CI passes a copy of the base branch's refcache.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRefs } from './lib/refcheck.mjs';

const USAGE = 'usage: node scripts/check-refs.mjs posts/<user>/<slug> [--fix] [--ci] [--cache <path>]';
const defaultCache = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'refcache.json');

// Returns the process exit code. fetchImpl / cachePath / fast / log are injectable for tests.
export async function runCli(argv, { fetchImpl = fetch, cachePath = defaultCache, fast = false, log = console.log } = {}) {
  const FIX = argv.includes('--fix');
  const CI = argv.includes('--ci');
  const ci = argv.indexOf('--cache');
  if (ci >= 0) { if (!argv[ci + 1]) { console.error(USAGE); return 1; } cachePath = argv[ci + 1]; }
  const postDir = argv.find((a, i) => !a.startsWith('--') && !(ci >= 0 && i === ci + 1));
  if (!postDir) { console.error(USAGE); return 1; }
  const refsPath = path.join(postDir, 'refs.json');
  const refs = JSON.parse(fs.readFileSync(refsPath, 'utf8'));
  const original = JSON.parse(JSON.stringify(refs));
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch {}

  if (CI) for (const r of refs) { r.verified = false; delete r.verified_via; delete r.verified_on; }
  const today = new Date().toISOString().slice(0, 10);
  const res = await checkRefs(refs, { fetchImpl, cache, today, fix: FIX, fast, log });

  // Refs that couldn't be checked (network) keep their previous state outside CI.
  const out = res.refs.map((r) => (!CI && res.networkFailedKeys.includes(r.key) ? original.find((o) => o.key === r.key) ?? r : r));
  fs.writeFileSync(refsPath, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(postDir, '.refcheck.json'), JSON.stringify({ checked_on: today, refs: res.abstracts }, null, 2) + '\n');
  if (CI) fs.writeFileSync(cachePath, JSON.stringify(res.cache, null, 2) + '\n');
  log(`\n${refs.length - res.unverified.length}/${refs.length} references verified. Abstracts saved to ${path.join(postDir, '.refcheck.json')}`);

  if (CI) {
    const status = res.networkFailed ? 'retry' : res.unverified.length ? 'failed' : 'ok';
    fs.writeFileSync(path.join(postDir, '.refcheck-status'), status + '\n');
    if (status === 'retry') log('::warning::references not re-checked (network), retry the job');
    log(`refcheck status: ${status}`);
    return status === 'failed' ? 1 : 0;
  }
  return res.unverified.length ? 1 : 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await runCli(process.argv.slice(2)));
