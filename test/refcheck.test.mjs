import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRefs } from '../scripts/lib/refcheck.mjs';

const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const CROSSREF = { message: { title: ['Attention Is All You Need'], author: [{ given: 'Ashish', family: 'Vaswani' }], issued: { 'date-parts': [[2017]] }, 'container-title': ['NeurIPS'], DOI: '10.5555/3295222', URL: 'https://doi.org/10.5555/3295222', abstract: '<p>Transformers.</p>' } };
const ARXIV = `<feed><entry><id>http://arxiv.org/abs/1706.03762v7</id><published>2017-06-12T00:00:00Z</published><title>Attention Is All You Need</title><summary>We propose the Transformer.</summary><author><name>Ashish Vaswani</name></author></entry></feed>`;
const stub = (log = []) => async (url) => {
  log.push(String(url));
  if (url.includes('api.crossref.org/works/10.5555')) return resp(200, CROSSREF);
  if (url.includes('api.crossref.org/works/')) return resp(404, {});
  if (url.includes('export.arxiv.org')) return resp(200, ARXIV);
  return resp(200, { data: [] });
};
const base = () => ({ key: 'vas17', title: 'Attention Is All You Need', authors: ['Ashish Vaswani'], year: 2017, doi: '10.5555/3295222' });
const opts = (o = {}) => ({ today: '2026-11-01', fast: true, ...o });

test('verifies doi reference', async () => {
  const res = await checkRefs([base()], opts({ fetchImpl: stub() }));
  assert.equal(res.networkFailed, false);
  assert.deepEqual(res.unverified, []);
  const r = res.refs[0];
  assert.equal(r.verified, true); assert.equal(r.verified_via, 'Crossref'); assert.equal(r.verified_on, '2026-11-01');
  assert.equal(res.abstracts.vas17.abstract, 'Transformers.');
  assert.equal(res.cache['doi:10.5555/3295222'].verified_via, 'Crossref');
});

test('ci mode resets incoming verified flags', async () => {
  const fake = { key: 'fake', title: 'A Paper That Does Not Exist', authors: ['Nobody'], year: 2020, doi: '10.9999/nope', verified: true, verified_via: 'manual', verified_on: '2020-01-01' };
  const res = await checkRefs([fake], opts({ fetchImpl: stub() }));
  assert.equal(res.refs[0].verified, false);
  assert.equal(res.refs[0].verified_via, undefined);
  assert.deepEqual(res.unverified, ['fake']);
  assert.equal(res.networkFailed, false);
});

test('uses cache without network', async () => {
  const first = await checkRefs([base()], opts({ fetchImpl: stub() }));
  const boom = async () => { throw new Error('offline'); };
  const res = await checkRefs([{ ...base(), verified: false }], opts({ fetchImpl: boom, cache: first.cache }));
  assert.equal(res.networkFailed, false);
  assert.equal(res.refs[0].verified, true);
  assert.equal(res.refs[0].verified_via, 'Crossref');
  assert.deepEqual(Object.keys(res.cache), [...Object.keys(res.cache)].sort());
});

test('network failure reports retry', async () => {
  const boom = async () => { throw new Error('offline'); };
  const res = await checkRefs([{ ...base(), verified: true }], opts({ fetchImpl: boom }));
  assert.equal(res.networkFailed, true);
  assert.equal(res.refs[0].verified, false);
  const r5xx = await checkRefs([base()], opts({ fetchImpl: async () => resp(503, {}) }));
  assert.equal(r5xx.networkFailed, true);
  assert.equal(r5xx.refs[0].verified, false);
});

test('arxiv id and title fallback verify; definitive not-found is not a network failure', async () => {
  const res = await checkRefs([{ key: 'a', title: 'Attention is all you need', authors: ['Vaswani, A.'], year: 2017, arxiv: '1706.03762' }, { key: 'b', title: 'Attention Is All You Need', authors: ['Ashish Vaswani'], year: 2017 }], opts({ fetchImpl: stub() }));
  assert.equal(res.networkFailed, false);
  assert.equal(res.refs[0].verified_via, 'arXiv');
  assert.equal(res.refs[1].verified, true);
});

// ---- CLI ----
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../scripts/check-refs.mjs';

function tmpPost(refs) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-refcli-'));
  fs.writeFileSync(path.join(d, 'refs.json'), JSON.stringify(refs));
  return { d, cachePath: path.join(d, 'cache.json') };
}
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const cli = (d, cachePath, fetchImpl) => runCli([d, '--ci'], { fetchImpl, cachePath, fast: true, log: () => {} });

test('cli --ci resets incoming verified flags and writes status ok + cache', async () => {
  const { d, cachePath } = tmpPost([{ ...base(), verified: true, verified_via: 'manual' }, { key: 'liar', title: 'Nope', doi: '10.9999/nope', verified: true }]);
  // the liar fails definitively, so status is failed; check the flags were reset
  const code = await cli(d, cachePath, stub());
  const refs = readJSON(path.join(d, 'refs.json'));
  assert.equal(refs[0].verified_via, 'Crossref');
  assert.equal(refs[1].verified, false);
  assert.equal(code, 1);
  assert.equal(fs.readFileSync(path.join(d, '.refcheck-status'), 'utf8').trim(), 'failed');
  assert.ok(readJSON(cachePath)['doi:10.5555/3295222']);
});

test('cli --ci status ok exits 0', async () => {
  const { d, cachePath } = tmpPost([{ ...base(), verified: false }]);
  assert.equal(await cli(d, cachePath, stub()), 0);
  assert.equal(fs.readFileSync(path.join(d, '.refcheck-status'), 'utf8').trim(), 'ok');
});

test('cli --ci network failure writes retry and exits 0', async () => {
  const { d, cachePath } = tmpPost([{ ...base(), verified: true }]);
  const code = await cli(d, cachePath, async () => { throw new Error('offline'); });
  assert.equal(code, 0);
  assert.equal(fs.readFileSync(path.join(d, '.refcheck-status'), 'utf8').trim(), 'retry');
  assert.equal(readJSON(path.join(d, 'refs.json'))[0].verified, false);
});

test('cli --cache <path> overrides the cache location, before or after the post dir', async () => {
  const { d, cachePath } = tmpPost([{ ...base(), verified: false }]);
  const other = path.join(d, 'base-cache.json');
  fs.writeFileSync(other, '{}');
  for (const argv of [['--cache', other, d, '--ci'], [d, '--ci', '--cache', other]]) {
    assert.equal(await runCli(argv, { fetchImpl: stub(), cachePath, fast: true, log: () => {} }), 0);
  }
  assert.ok(readJSON(other)['doi:10.5555/3295222']);
  assert.equal(fs.existsSync(cachePath), false);
});
