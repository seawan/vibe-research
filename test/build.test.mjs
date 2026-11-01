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
  // refuses to overwrite
  const again = spawnSync('node', ['scripts/new-post.mjs', '--user', 'alice', 'My Title'], { cwd: tmp, encoding: 'utf8' });
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /already exists/);
  // the scaffold builds as a draft without crashing
  const r = buildSite({ postsDir: path.join(tmp, 'posts'), outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-o-')), drafts: true });
  assert.deepEqual(r.errors, []);
});
