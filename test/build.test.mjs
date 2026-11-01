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
