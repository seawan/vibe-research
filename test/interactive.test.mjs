import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build.mjs';
import { validatePost } from '../scripts/lib/post-schema.mjs';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/posts/alice/hello');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// copy the fixture post and add front-matter lines after the license line
function setup(extra, pages = {}) {
  const posts = tmp('vibe-int-posts-'), interactiveDir = tmp('vibe-int-pages-');
  const d = path.join(posts, 'alice/hello');
  fs.cpSync(SRC, d, { recursive: true });
  const f = path.join(d, 'index.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/license: CC-BY-4.0\r?\n/, 'license: CC-BY-4.0\n' + extra));
  for (const [name, html] of Object.entries(pages)) fs.writeFileSync(path.join(interactiveDir, name), html);
  const outDir = tmp('vibe-int-out-');
  return { outDir, result: buildSite({ postsDir: posts, outDir, interactiveDir }) };
}

test('interactive pages are copied and linked from the post', () => {
  const { outDir, result } = setup('interactive: demo\n', { 'demo.html': '<!doctype html><title>Demo</title>', '.hidden': 'x' });
  assert.deepEqual(result.errors, []);
  assert.ok(fs.existsSync(path.join(outDir, 'interactive/demo.html')));
  assert.ok(!fs.existsSync(path.join(outDir, 'interactive/.hidden')));
  const html = fs.readFileSync(path.join(outDir, 'posts/alice/hello/index.html'), 'utf8');
  assert.match(html, /<p class="interactive-cta"><a href="\.\.\/\.\.\/\.\.\/interactive\/demo\.html">/);
});

test('posts without interactive get no link', () => {
  const { outDir, result } = setup('', { 'demo.html': '<!doctype html>' });
  assert.deepEqual(result.errors, []);
  assert.doesNotMatch(fs.readFileSync(path.join(outDir, 'posts/alice/hello/index.html'), 'utf8'), /interactive-cta/);
});

test('a missing interactive page is a build error', () => {
  const { result } = setup('interactive: nope\n');
  assert.ok(result.errors.some((e) => e === 'alice/hello: interactive: interactive/nope.html does not exist'));
});

test('interactive names cannot escape the folder', () => {
  for (const bad of ['../evil', 'Demo', 'demo.html', 'a/b', '']) {
    const errs = validatePost({ fm: { interactive: bad }, files: [] });
    assert.ok(errs.some((e) => e.startsWith('interactive:')), bad);
  }
  assert.ok(!validatePost({ fm: { interactive: 'self-taught-adder' }, files: [] }).some((e) => e.startsWith('interactive:')));
  const { outDir, result } = setup('interactive: "../../evil"\n', { 'demo.html': 'x' });
  assert.ok(result.errors.some((e) => e.startsWith('alice/hello: interactive: must be')));
  assert.doesNotMatch(fs.readFileSync(path.join(outDir, 'posts/alice/hello/index.html'), 'utf8'), /interactive-cta/);
});
