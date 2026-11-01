import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build.mjs';
import { postCard, searchIndex, tagSlug } from '../scripts/lib/pages.mjs';
import { buildFixture } from './helpers.mjs';

const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/posts');
const cardOf = (html, id) => html.match(new RegExp(`<li class="post-item" data-id="${id}"[\\s\\S]*?</li>`))[0];

test('home lists posts newest first', () => {
  const { outDir, result } = buildFixture();
  assert.deepEqual(result.errors, []);
  const home = read(outDir, 'index.html');
  assert.ok(home.indexOf('data-id="alice/hello"') < home.indexOf('data-id="bob/second"'));
  assert.match(home, /class="search-box"/);
  assert.match(home, /assets\/site\.js/);
});

test('card shows ai chips and badge only for badged post', () => {
  const { outDir } = buildFixture();
  const home = read(outDir, 'index.html');
  const a = cardOf(home, 'alice/hello'), b = cardOf(home, 'bob/second');
  assert.match(a, /data-ai="claude"/);
  assert.match(a, /data-badge="1"/);
  assert.match(a, /Delta-reproducible/);
  assert.match(b, /data-ai="chatgpt"/);
  assert.match(b, /data-badge="0"/);
  assert.doesNotMatch(b, /Delta-reproducible/);
  assert.match(b, /ai-chip">ChatGPT/);
});

test('tag page lists only tagged posts', () => {
  const { outDir } = buildFixture();
  const page = read(outDir, 'tags/monte-carlo/index.html');
  assert.match(page, /data-id="bob\/second"/);
  assert.doesNotMatch(page, /data-id="alice\/hello"/);
  assert.match(page, /href="\.\.\/\.\.\/posts\/bob\/second\/"/);
  assert.equal(tagSlug('Monte Carlo!'), 'monte-carlo');
});

test('author page and author feed exist for each author', () => {
  const { outDir } = buildFixture();
  for (const u of ['alice', 'bob']) {
    assert.ok(fs.existsSync(path.join(outDir, `@${u}/index.html`)));
    assert.match(read(outDir, `@${u}/feed.xml`), new RegExp(`<title>${u} · Vibe Research</title>`));
  }
  assert.match(read(outDir, '@alice/index.html'), /data-id="bob\/second"/);
  assert.match(read(outDir, '@alice/index.html'), /data-id="alice\/hello"/);
  assert.doesNotMatch(read(outDir, '@bob/index.html'), /data-id="alice\/hello"/);
  assert.match(read(outDir, '@bob/feed.xml'), /https:\/\/seawan\.github\.io\/vibe-research\/posts\/bob\/second\//);
  assert.match(read(outDir, 'feed.xml'), /<title>Vibe Research<\/title>/);
});

test('search index has one entry per post with authors and ai', () => {
  const { outDir, result } = buildFixture();
  const idx = JSON.parse(read(outDir, 'search.json'));
  assert.equal(idx.length, result.posts.length);
  const b = idx.find((e) => e.id === 'bob/second');
  assert.deepEqual(b.authors, ['bob', 'alice']);
  assert.deepEqual(b.ai, ['ChatGPT']);
  assert.deepEqual(b.tags, ['monte carlo', 'sampling']);
  assert.equal(b.url, 'posts/bob/second/');
  assert.deepEqual(Object.keys(b).sort(), ['ai', 'authors', 'id', 'subtitle', 'summary', 'tags', 'title', 'url']);
});

test('drafts excluded from home, tags, authors, search and feeds', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-draft-'));
  fs.cpSync(SRC, root, { recursive: true });
  const f = path.join(root, 'bob/second/index.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('license: CC-BY-4.0\n', 'license: CC-BY-4.0\ndraft: true\n'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-draft-out-'));
  const r = buildSite({ postsDir: root, outDir: out, drafts: true });
  assert.deepEqual(r.errors, []);
  assert.ok(fs.existsSync(path.join(out, 'posts/bob/second/index.html')));
  for (const file of ['index.html', '@alice/index.html', '@alice/feed.xml', 'feed.xml', 'search.json']) assert.doesNotMatch(read(out, file), /bob\/second/, file);
  assert.ok(!fs.existsSync(path.join(out, 'tags/monte-carlo')));
  assert.ok(!fs.existsSync(path.join(out, '@bob')));
  assert.equal(searchIndex(r.posts).length, 1);
  assert.doesNotMatch(postCard(r.posts[0], ''), /DRAFT/);
});
