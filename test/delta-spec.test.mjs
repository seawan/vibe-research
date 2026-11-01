import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeltaSpec, figuresIn, checkFigures, computeBadge } from '../scripts/lib/delta-spec.mjs';
import { buildSite } from '../scripts/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALID = fs.readFileSync(path.join(HERE, 'fixtures/delta/valid.yaml'), 'utf8');
const tweak = (from, to) => { assert.ok(VALID.includes(from), from); return parseDeltaSpec(VALID.replace(from, to)); };
const has = (errs, s) => assert.ok(errs.some((x) => x.includes(s)), `expected an error containing "${s}", got ${JSON.stringify(errs)}`);

test('parses valid spec', () => {
  const { spec, errors } = parseDeltaSpec(VALID);
  assert.deepEqual(errors, []);
  assert.equal(spec.sandbox.gpu_mem, 24000);
  assert.equal(parseDeltaSpec(VALID.replace('upload: "."\n', '')).spec.upload, '.');
});
test('rejects shm_size above memory', () => has(tweak('shm_size: 4Gi', 'shm_size: 32Gi').errors, 'shm_size'));
test('requires gpu_mem when gpu > 0', () => has(tweak('  gpu_mem: 24000\n', '').errors, 'gpu_mem'));
test('rejects output path with ..', () => has(tweak('- results.csv', '- ../results.csv').errors, 'outputs'));
test('rejects absolute paths', () => { has(tweak('- results.csv', '- /etc/passwd').errors, 'outputs'); has(tweak('upload: "."', 'upload: "/tmp"').errors, 'upload'); });
test('rejects unknown deployment', () => has(tweak('overseas', 'mars').errors, 'deployment'));
test('rejects bad ranges', () => {
  has(tweak('max_life: 120', 'max_life: 2000').errors, 'max_life');
  has(tweak('timeout: 3600', 'timeout: 0').errors, 'timeout');
  has(tweak('cpu: 4', 'cpu: 0').errors, 'cpu');
  has(tweak('memory: 16Gi', 'memory: 16GB').errors, 'memory');
});
test('rejects invalid yaml', () => has(parseDeltaSpec('a: [').errors, 'YAML'));

test('normalizes figure paths', () => {
  const figs = figuresIn('![a](./figs/a.png "Cap")\n\n```\n![x](skip.png)\n```\n');
  assert.deepEqual(figs, [{ path: 'figs/a.png', diagram: false }]);
  assert.deepEqual(checkFigures({ figures: figs, outputs: ['figs/a.png'] }), []);
});
test('diagram marker exempts figure and is stripped', () => {
  const figs = figuresIn('![d](flow.svg "The flow {diagram}")');
  assert.deepEqual(figs, [{ path: 'flow.svg', diagram: true }]);
  assert.deepEqual(checkFigures({ figures: figs, outputs: [] }), []);
});
test('figuresIn follows marked: quotes, angle paths, references, nesting, code', () => {
  const md = [
    "![a](x.png 'T {diagram}')", '![b](<my fig.png>)', '![c [d]](nested.png)', '![e][1]', '![f]( ./sub/g.png "G")',
    '`![h](inline.png)`', '', '    ![i](indented.png)', '', '- item ![j](list.png)', '', '> ![k](quote.png)', '', '[1]: ref.png',
  ].join('\n');
  assert.deepEqual(figuresIn(md), [
    { path: 'x.png', diagram: true }, { path: 'my fig.png', diagram: false }, { path: 'nested.png', diagram: false },
    { path: 'ref.png', diagram: false }, { path: 'sub/g.png', diagram: false }, { path: 'list.png', diagram: false }, { path: 'quote.png', diagram: false },
  ]);
});
test('figure not in outputs is an error', () => has(checkFigures({ figures: [{ path: 'a.png', diagram: false }], outputs: ['b.png'] }), 'a.png'));

const mkPost = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-badge-'));
  for (const [n, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true }); fs.writeFileSync(path.join(dir, n), c); }
  return dir;
};
const spec = () => ({ upload: '.', command: 'python experiment.py', outputs: ['results.csv'] });
const run0 = { exit_code: 0 };
const full = () => mkPost({ 'experiment.py': '', 'results.csv': '' });

test('badge granted for complete package', () => {
  const r = computeBadge({ postDir: full(), spec: spec(), run: run0, figures: [] });
  assert.deepEqual(r, { badge: true, reasons: [] });
});
test('no badge without run.json', () => {
  const r = computeBadge({ postDir: full(), spec: spec(), run: null, figures: [] });
  assert.equal(r.badge, false);
  has(r.reasons, 'run.json');
});
test('no badge when an output file is missing', () => {
  const r = computeBadge({ postDir: mkPost({ 'experiment.py': '' }), spec: spec(), run: run0, figures: [] });
  assert.equal(r.badge, false);
  has(r.reasons, 'results.csv');
});
test('no badge when script is missing, nonzero exit, or figure unlisted', () => {
  has(computeBadge({ postDir: mkPost({ 'results.csv': '' }), spec: spec(), run: run0 }).reasons, 'experiment.py');
  has(computeBadge({ postDir: full(), spec: spec(), run: { exit_code: 1 } }).reasons, 'exit_code');
  has(computeBadge({ postDir: full(), spec: spec(), run: run0, figures: [{ path: 'z.png', diagram: false }] }).reasons, 'z.png');
  has(computeBadge({ postDir: full(), spec: null, run: run0 }).reasons, 'delta.yaml');
});
test('outputs and script are relative to upload', () => {
  const s = { upload: 'code', command: 'python experiment.py', outputs: ['fig.png'] };
  const dir = mkPost({ 'code/experiment.py': '', 'code/fig.png': '' });
  assert.deepEqual(computeBadge({ postDir: dir, spec: s, run: run0, figures: [{ path: 'code/fig.png', diagram: false }] }), { badge: true, reasons: [] });
  has(computeBadge({ postDir: dir, spec: s, run: run0, figures: [{ path: 'fig.png', diagram: false }] }).reasons, 'fig.png');
  assert.deepEqual(checkFigures({ figures: [{ path: 'code/fig.png', diagram: false }], outputs: ['fig.png'], upload: 'code' }), []);
  has(computeBadge({ postDir: mkPost({ 'experiment.py': '', 'fig.png': '' }), spec: s, run: run0 }).reasons, 'upload directory');
});
test('symlink escaping the post dir does not count', () => {
  const outside = mkPost({ 'secret.csv': '' });
  const dir = mkPost({ 'experiment.py': '' });
  fs.symlinkSync(path.join(outside, 'secret.csv'), path.join(dir, 'results.csv'));
  has(computeBadge({ postDir: dir, spec: spec(), run: run0 }).reasons, 'results.csv');
  fs.rmSync(path.join(dir, 'results.csv')); fs.writeFileSync(path.join(dir, 'real.csv'), '');
  fs.symlinkSync('real.csv', path.join(dir, 'results.csv'));
  assert.equal(computeBadge({ postDir: dir, spec: spec(), run: run0 }).badge, true);
});
test('non-interpreter command skips script check', () => {
  const s = { ...spec(), command: './run_all --fast' };
  assert.equal(computeBadge({ postDir: mkPost({ 'results.csv': '' }), spec: s, run: run0 }).badge, true);
});

test('include-expanded content is what gets scanned (images in included code are code, not figures)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-inc-'));
  fs.cpSync(path.join(HERE, 'fixtures/posts'), root, { recursive: true });
  const d = path.join(root, 'alice/hello');
  fs.writeFileSync(path.join(d, 'snippet.md'), '![s](in-include.png)\n');
  fs.appendFileSync(path.join(d, 'index.md'), '\n@include snippet.md\n');
  const r = buildSite({ postsDir: root, outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-out-')) });
  assert.deepEqual(r.errors, []);
  assert.equal(r.posts[0].delta.badge, true);
});
test('fixture post earns the badge in a build; bad figure fails it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-fx-'));
  fs.cpSync(path.join(HERE, 'fixtures/posts'), root, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-out-'));
  let r = buildSite({ postsDir: root, outDir });
  assert.deepEqual(r.errors, []);
  assert.equal(r.posts[0].delta.badge, true);
  fs.appendFileSync(path.join(root, 'alice/hello/index.md'), '\n![plot](plot.png "A plot")\n\n![d](flow.svg "The flow {diagram}")\n');
  r = buildSite({ postsDir: root, outDir });
  has(r.errors, 'plot.png');
  assert.equal(r.errors.length, 1);
  const html = fs.readFileSync(path.join(outDir, 'posts/alice/hello/index.html'), 'utf8');
  assert.ok(html.includes('<figcaption>The flow</figcaption>'));
});
