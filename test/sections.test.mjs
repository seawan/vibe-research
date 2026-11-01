import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build.mjs';
import { aiProcessBox, specsSection, verificationBox, reproduceBox, bylineHtml, updatedHtml, resolveResultMacros, postCommit } from '../scripts/lib/sections.mjs';
import { buildFixture } from './helpers.mjs';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/posts/alice/hello');
const run = {
  version: 1, execution_id: 'exec-123', sandbox: { image: 'PyTorch CUDA13 (GPU)', cpu: 4, memory: '16Gi', gpu: 1, gpu_mem: 24000, gpu_type: 'RTX 4090', deployment: 'overseas' },
  started_at: '2026-11-01T09:00:00Z', finished_at: '2026-11-01T09:01:05Z', duration_s: 65, exit_code: 0, delta_cli_version: '1.2.3', packages: ['numpy==2.0.0', 'scipy==1.14.0'], result_summary: { qmc: 1.5, errors: { qmc: 0.001 } },
};

// a modified copy of the fixture post, built to a temp dir
function buildVariant(edit, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-sec-'));
  const d = path.join(root, 'alice/hello');
  fs.cpSync(SRC, d, { recursive: true });
  edit(d);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-sec-o-'));
  const result = buildSite({ postsDir: root, outDir, ...opts });
  const file = path.join(outDir, 'posts/alice/hello/index.html');
  return { result, html: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' };
}
const appendBody = (text) => (d) => fs.appendFileSync(path.join(d, 'index.md'), text);

test('ai box lists every model and the contribution', () => {
  const html = aiProcessBox({
    ai: [{ name: 'Claude', model: 'claude-opus-5-5', role: 'derivations' }, { name: 'ChatGPT', model: 'gpt-x', role: 'literature <search>' }],
    contribution: 'I chose the question & checked everything.', chat_links: ['https://claude.ai/share/abc'],
  }, ['chat/notes.md']);
  for (const s of ['claude-opus-5-5', 'gpt-x', 'derivations', 'I chose the question &amp; checked everything.', 'https://claude.ai/share/abc', 'chat/notes.md']) assert.ok(html.includes(s), s);
  assert.ok(html.includes('literature &lt;search&gt;'));
});

test('specs from run.json include execution id and gpu type', () => {
  const html = specsSection({ spec: null, run, fm: {} });
  for (const s of ['id="specs"', 'exec-123', 'RTX 4090', '24000 MiB', '16Gi', 'PyTorch CUDA13 (GPU)', 'overseas', '2026-11-01', '1 min 5 s', 'numpy==2.0.0', '<details']) assert.ok(html.includes(s), s);
  assert.ok(!html.includes('self-reported'));
});

test('specs without run.json are marked self-reported', () => {
  const html = specsSection({ spec: null, run: null, fm: { specs: 'MacBook M2, 16 GB' } });
  assert.ok(html.includes('self-reported'));
  assert.ok(html.includes('MacBook M2, 16 GB'));
  assert.ok(html.includes('id="specs"'));
});

test('verification box shows checked text and verifier', () => {
  const html = verificationBox({ verified: true, by: 'alice', date: new Date('2026-11-01'), checked: 'Re-ran it twice & compared.' });
  for (const s of ['id="author-verification"', '@alice', '2026-11-01', 'Re-ran it twice &amp; compared.']) assert.ok(html.includes(s), s);
});

test('reproduce box pins command to commit', () => {
  const spec = { sandbox: { cpu: 1, memory: '2Gi', gpu: 0, max_life: 10 }, deployment: 'overseas' };
  const html = reproduceBox({ spec, run, badge: true, reasons: [], id: 'alice/hello', commit: 'abc123def', repo: 'seawan/vibe-research' });
  for (const s of ['id="reproduce"', 'npx -y github:seawan/vibe-research#abc123def alice/hello', 'delta.yaml', 'Need Delta? Register for delta-cli first.', '1 CPU']) assert.ok(html.includes(s), s);
});

test('reproduce box without badge lists reasons', () => {
  const html = reproduceBox({ spec: null, run: null, badge: false, reasons: ['run.json is missing <x>'], id: 'a/b', commit: 'main', repo: 'seawan/vibe-research' });
  assert.ok(html.includes('run.json is missing &lt;x&gt;'));
  assert.ok(!html.includes('npx -y'));
});

test('shows updated date linking to history', () => {
  const h = updatedHtml('2026-12-05', '2026-11-01', 'seawan/vibe-research', 'alice/hello');
  assert.ok(h.includes('Updated 2026-12-05'));
  assert.ok(h.includes('https://github.com/seawan/vibe-research/commits/main/posts/alice/hello'));
  assert.equal(updatedHtml('2026-11-01', '2026-11-01', 'r/r', 'a/b'), '');
  assert.equal(updatedHtml(null, '2026-11-01', 'r/r', 'a/b'), '');
  const { html } = buildVariant(() => {}, { commitInfo: () => ({ sha: 'deadbeef', date: '2027-01-02' }) });
  assert.ok(html.includes('Updated 2027-01-02'));
  assert.ok(html.includes('github:seawan/vibe-research#deadbeef alice/hello'));
});

test('byline links authors with avatars', () => {
  const h = bylineHtml(['alice', 'bob'], '../../../');
  assert.ok(h.includes('https://github.com/alice.png?size=64'));
  assert.ok(h.includes('href="../../../@bob/"'));
});

test('postCommit tolerates non-git directories', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-nogit-'));
  assert.deepEqual(postCommit(d), { sha: 'main', date: null });
});

test('result macro substitutes value', () => {
  const r = resolveResultMacros('QMC {{result.qmc}} and {{ result.errors.qmc }}.', run.result_summary);
  assert.equal(r.markdown, 'QMC 1.5 and 0.001.');
  assert.deepEqual(r.errors, []);
  const b = buildVariant((d) => {
    fs.writeFileSync(path.join(d, 'run.json'), JSON.stringify(run));
    fs.appendFileSync(path.join(d, 'index.md'), '\nThe value is {{result.errors.qmc}}.\n');
  });
  assert.ok(b.html.includes('The value is 0.001.'));
});

test('unknown result macro is an error', () => {
  assert.ok(resolveResultMacros('{{result.nope}}', { a: 1 }).errors.length === 1);
  assert.ok(resolveResultMacros('{{result.a}}', null).errors.length === 1);
  assert.ok(resolveResultMacros('{{result.a}}', { a: { b: 1 } }).errors.length === 1);
  const b = buildVariant(appendBody('\n{{result.missing}}\n'));
  assert.ok(b.result.errors.some((e) => e.includes('result.missing')));
  const dr = buildVariant((d) => { fs.appendFileSync(path.join(d, 'index.md'), '\n{{result.missing}}\n'); fs.writeFileSync(path.join(d, 'index.md'), fs.readFileSync(path.join(d, 'index.md'), 'utf8').replace('date: 2026-11-01\n', 'date: 2026-11-01\ndraft: true\n')); }, { drafts: true });
  assert.ok(!dr.result.errors.some((e) => e.includes('result.missing')));
  assert.ok(dr.result.warnings.some((w) => w.includes('result.missing')));
});

test('escapes raw html', () => {
  const { html } = buildVariant(appendBody('\n<script>alert(1)</script>\n\nInline <img onerror=x> text.\n'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('math still renders and citations survive html escaping', () => {
  const { html, result } = buildVariant(appendBody('\nInline $x^2$ and\n\n$$y = z$$\n'));
  assert.deepEqual(result.errors, []);
  assert.ok(html.includes('class="katex'));
  assert.ok(html.includes('class="cite"'));
  assert.ok(!/[\uE000\uE001]/.test(html));
  assert.ok(html.includes('href="#ref-metropolis1949"'));
});

test('specs inserted before experiment heading', () => {
  const { outDir } = buildFixture();
  const html = fs.readFileSync(path.join(outDir, 'posts/alice/hello/index.html'), 'utf8');
  const i = html.indexOf('id="specs"'), j = html.indexOf('id="what-we-did"');
  assert.ok(i > 0 && i < j);
  const order = ['AI &amp; process', 'id="specs"', 'id="what-we-did"', 'id="code-and-data"', 'id="author-verification"', 'id="references"', 'id="reproduce"', 'class="disclosure"'].map((s) => html.indexOf(s));
  assert.ok(order.every((n) => n > 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(html.includes('href="#specs"'));
});

test('unsafe link and image schemes render as plain text', () => {
  const bad = ['javascript:alert(1)', ' JaVaScRiPt:alert(2)', 'vbscript:x', 'data:text/html,<b>x</b>', 'java\tscript:alert(3)', 'java&#115;cript:alert(4)', '&#x6A;avascript&colon;alert(5)'];
  const md = '\n' + bad.map((u, i) => `[link${i}](<${u}>)`).join('\n\n') + '\n\n<javascript:alert(9)>\n\n![img](<data:image/svg+xml,x>)\n\n[ok](https://example.com) [rel](add.py) [frag](#x)\n';
  const { html } = buildVariant((d) => {
    appendBody(md)(d);
    const f = path.join(d, 'index.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('title: "Hello, Vibe Research"', 'title: "[t](javascript:alert(5))"\nsubtitle: "[s](vbscript:x)"'));
  });
  assert.ok(!/(?:href|src)="\s*(?:javascript|vbscript|data|java)/i.test(html), 'unsafe URL in an attribute');
  assert.ok(html.includes('link0') && html.includes('link1'));
  assert.ok(html.includes('href="https://example.com"') && html.includes('href="#x"') && html.includes('href="add.py.html"'));
});

test('citations are never raw html: link titles, code spans, includes', () => {
  const { html, result } = buildVariant((d) => {
    fs.writeFileSync(path.join(d, 'inc.py'), 'print("0")\n');
    fs.appendFileSync(path.join(d, 'index.md'), '\n[x](https://example.com "t [@metropolis1949]")\n\nCode `[@metropolis1949]` here.\n\n[@metropolis1949]\n\n@include inc.py\n');
  });
  assert.deepEqual(result.errors, []);
  assert.ok(!/title="[^"]*<span/.test(html));
  assert.ok(html.includes('<code>[@metropolis1949]</code>'));
  assert.ok(html.includes('<p><span class="cite">'));
  assert.ok(html.includes('class="code-caption"'));
  assert.ok(!/<span class="cite">\[[^\]]*/.test(html));
});

test('reproduce box omits missing resource parts', () => {
  const html = reproduceBox({ spec: { sandbox: { memory: '2Gi' } }, run: null, badge: true, reasons: [], id: 'a/b', commit: 'x', repo: 'r/r' });
  assert.ok(!html.includes('undefined'));
  assert.ok(html.includes('2Gi memory'));
});
