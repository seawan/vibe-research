import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build.mjs';
import { buildFixture } from './helpers.mjs';

test('builds nested user/slug posts', () => {
  const { outDir, result } = buildFixture();
  assert.deepEqual(result.errors, []);
  assert.ok(fs.existsSync(path.join(outDir, 'posts/alice/hello/index.html')));
  const a = result.posts.find((p) => p.id === 'alice/hello');
  assert.equal(a.user, 'alice');
  assert.equal(a.slug, 'hello');
});

test('schema violations are build errors, or warnings for drafts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-schema-'));
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/posts/alice/hello');
  const put = (extra) => {
    const d = path.join(root, 'alice/bad'); fs.rmSync(d, { recursive: true, force: true });
    fs.cpSync(src, d, { recursive: true });
    const f = path.join(d, 'index.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('license: CC-BY-4.0\n', 'license: GPL-3.0\n' + extra));
  };
  put('');
  let r = buildSite({ postsDir: root, outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-o-')) });
  assert.ok(r.errors.some((e) => e.startsWith('alice/bad: license:')));
  put('draft: true\n');
  r = buildSite({ postsDir: root, outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-o-')), drafts: true });
  assert.ok(!r.errors.some((e) => e.includes('license:')));
  assert.ok(r.warnings.some((e) => e.startsWith('alice/bad: license:')));
});

test('cli --summary writes badge status per post', async () => {
  const { execFileSync } = await import('node:child_process');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-summary-'));
  const summary = path.join(tmp, 'report', 'build.json');
  execFileSync(process.execPath, [path.join(here, '../scripts/build.mjs'), '--drafts', '--posts', path.join(here, 'fixtures/posts'), '--out', path.join(tmp, 'dist'), '--summary', summary], { stdio: 'pipe' });
  const s = JSON.parse(fs.readFileSync(summary, 'utf8'));
  assert.deepEqual(s.errors, []);
  const hello = s.posts.find((p) => p.id === 'alice/hello');
  assert.equal(typeof hello.badge, 'boolean');
  assert.ok(Array.isArray(hello.reasons));
});

test('new-post scaffolds nested folder', async () => {
  const { execFileSync, spawnSync } = await import('node:child_process');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repo = path.resolve(here, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-new-'));
  for (const d of ['scripts', 'templates']) fs.cpSync(path.join(repo, d), path.join(tmp, d), { recursive: true });
  for (const f of ['package.json', 'site.config.json']) fs.copyFileSync(path.join(repo, f), path.join(tmp, f));
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(tmp, 'node_modules'));
  execFileSync('node', ['scripts/new-post.mjs', '--user', 'alice', 'My Title'], { cwd: tmp });
  const dir = path.join(tmp, 'posts/alice/my-title');
  const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8');
  const fm = md.split('---')[1];
  assert.match(fm, /^authors: \[alice\](\s|$)/m);
  assert.match(fm, /^license: CC-BY-4\.0(\s|$)/m);
  assert.match(fm, /^code_license: MIT(\s|$)/m);
  assert.match(fm, /^draft: true(\s|$)/m);
  assert.ok(fs.existsSync(path.join(dir, 'refs.json')));
  assert.ok(!/^## Reproduce/mi.test(md));
  execFileSync('node', ['scripts/new-post.mjs', '--user=bob', 'Other'], { cwd: tmp });
  assert.ok(fs.existsSync(path.join(tmp, 'posts/bob/other/index.md')));
  // refuses to overwrite
  const again = spawnSync('node', ['scripts/new-post.mjs', '--user', 'alice', 'My Title'], { cwd: tmp, encoding: 'utf8' });
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /already exists/);
  // the scaffold builds as a draft without crashing
  const r = buildSite({ postsDir: path.join(tmp, 'posts'), outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-o-')), drafts: true });
  assert.deepEqual(r.errors, []);
});

// copy the hello fixture to a temp posts tree, apply edits, build
function buildVariant(edit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-var-'));
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/posts/alice/hello');
  const d = path.join(root, 'alice/var');
  fs.cpSync(src, d, { recursive: true });
  edit(d);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-o-'));
  return { d, outDir, result: buildSite({ postsDir: root, outDir }) };
}

test('notebook outputs cannot inject markup (img base64, svg, html, execution_count)', () => {
  const nb = {
    metadata: { kernelspec: { language: 'python' } },
    cells: [{
      cell_type: 'code', execution_count: '"><img src=x onerror=alert(4)>', source: 'print(1)',
      outputs: [
        { output_type: 'display_data', data: { 'image/png': 'AAA"onerror="alert(2)' } },
        { output_type: 'display_data', data: { 'image/jpeg': 'AAA"onerror="alert(2)' } },
        { output_type: 'display_data', data: { 'image/svg+xml': '<svg onload=alert(1)>' } },
        { output_type: 'execute_result', data: { 'text/html': '<script>alert(3)</script>', 'text/plain': 'plain <b>fallback</b>' } },
        { output_type: 'execute_result', data: { 'text/html': ['<script>alert(5)</script>'] } },
        { output_type: 'display_data', data: { 'image/png': 'iVBO\nRw0K' } },
      ],
    }],
  };
  const { outDir, result } = buildVariant((d) => fs.writeFileSync(path.join(d, 'nb.ipynb'), JSON.stringify(nb)));
  assert.deepEqual(result.errors, []);
  const html = fs.readFileSync(path.join(outDir, 'posts/alice/var/nb.ipynb.html'), 'utf8');
  for (const bad of ['onerror="alert(2)', '<svg onload', '<script>alert(3)', '<script>alert(5)', '<img src=x onerror', '<b>fallback']) assert.ok(!html.includes(bad), bad);
  assert.match(html, /\[image omitted\]/);
  assert.ok(html.includes(`<img src="data:image/svg+xml;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}" alt="SVG output">`));
  assert.ok(html.includes('plain &lt;b&gt;fallback&lt;/b&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(5)&lt;/script&gt;'));
  assert.ok(html.includes('data:image/png;base64,iVBORw0K"'));
  assert.ok(html.includes('In [ ]'));
});

test('wrong-typed front matter and malformed JSON are per-post errors, not crashes', () => {
  const fmEdit = (from, to) => (d) => { const f = path.join(d, 'index.md'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(from, to)); };
  for (const [edit, re] of [
    [fmEdit(/ai:\n(  .*\n)+/, 'ai: "Claude"\n'), /alice\/var: ai:/],
    [fmEdit('authors: [alice]', 'authors: alice'), /alice\/var: authors:/],
    [fmEdit('license: CC-BY-4.0', 'license: CC-BY-4.0\ntags: maths\nchat_links: "https://x.org"\noutputs: 3\ntldr: hi'), /alice\/var: (tags|chat_links|outputs|tldr):/],
    [fmEdit('license: CC-BY-4.0', 'license: CC-BY-4.0\nai:\n  - null'), /alice\/var/],
    [(d) => fs.writeFileSync(path.join(d, 'refs.json'), '{not json'), /alice\/var: refs\.json/],
    [(d) => fs.writeFileSync(path.join(d, 'refs.json'), '{"a": 1}'), /alice\/var: refs\.json/],
    [(d) => fs.writeFileSync(path.join(d, 'run.json'), '{not json'), /alice\/var: run\.json/],
  ]) {
    let result;
    assert.doesNotThrow(() => { ({ result } = buildVariant(edit)); });
    assert.ok(result.errors.some((e) => re.test(e)), `${re}: ${result.errors.join(' | ')}`);
  }
});
