import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkPr, ALLOWED_EXTENSIONS, LIMITS, checklistMd } from '../scripts/lib/pr-policy.mjs';
import { runCli } from '../scripts/check-pr.mjs';

const authorsOf = (map) => (id) => map[id] ?? null;
const run = (changed, { prAuthor = 'alice', base = {}, head = {} } = {}) =>
  checkPr({ changed, prAuthor, baseAuthors: authorsOf(base), headAuthors: (id) => head[id] ?? [] });
const f = (p, size = 100, extra = {}) => ({ path: p, size, ...extra });

test('exports allowlist and limits', () => {
  assert.ok(ALLOWED_EXTENSIONS.includes('ipynb') && ALLOWED_EXTENSIONS.includes('lean') && !ALLOWED_EXTENSIONS.includes('html'));
  assert.deepEqual(LIMITS, { fileBytes: 5_000_000, postBytes: 25_000_000 });
});

test('accepts new post by its owner', () => {
  assert.deepEqual(run([f('posts/alice/new/index.md'), f('posts/alice/new/run.py'), f('posts/alice/new/fig.PNG')], { head: { 'alice/new': ['alice'] } }), []);
});

test('rejects path outside posts', () => {
  for (const p of ['README.md', 'scripts/build.mjs', 'refcache.json', '.github/workflows/pr-check.yml', 'posts/alice/index.md', 'posts/../x/y/z.md']) {
    const v = run([f(p)], { head: { 'alice/new': ['alice'] } });
    assert.ok(v.some((m) => m.includes(p) && /posts\/<user>\/<slug>/.test(m)), `${p}: ${v}`);
  }
});

test('rejects editing another user\'s post', () => {
  const v = run([f('posts/bob/old/index.md')], { base: { 'bob/old': ['bob'] }, head: { 'bob/old': ['bob'] } });
  assert.equal(v.length, 1);
  assert.match(v[0], /bob\/old/);
  // a new post in someone else's folder is rejected even if the PR author lists themselves
  assert.ok(run([f('posts/bob/fresh/index.md')], { head: { 'bob/fresh': ['bob', 'alice'] } }).length > 0);
  // a new post whose authors don't include the PR author
  assert.ok(run([f('posts/alice/fresh/index.md')], { head: { 'alice/fresh': ['bob'] } }).length > 0);
});

test('uses base-branch authors', () => {
  const v = run([f('posts/bob/old/index.md')], { base: { 'bob/old': ['bob'] }, head: { 'bob/old': ['bob', 'alice'] } });
  assert.ok(v.some((m) => /bob\/old/.test(m)));
});

test('co-author may edit listed post', () => {
  assert.deepEqual(run([f('posts/bob/old/index.md'), f('posts/bob/old/extra.py', 0, { deleted: true })], { base: { 'bob/old': ['bob', 'alice'] }, head: { 'bob/old': ['bob', 'alice'] } }), []);
});

test('deleting files in own post is allowed', () => {
  assert.deepEqual(run([f('posts/alice/old/index.md', 0, { deleted: true }), f('posts/alice/old/model.pt', 0, { deleted: true })], { base: { 'alice/old': ['alice'] } }), []);
});

test('rejects disallowed extension', () => {
  const v = run([f('posts/alice/new/model.pt'), f('posts/alice/new/page.html'), f('posts/alice/new/Makefile'), f('posts/alice/new/index.md')], { head: { 'alice/new': ['alice'] } });
  assert.equal(v.length, 3);
  assert.ok(v.some((m) => m.includes('model.pt')) && v.some((m) => m.includes('page.html')) && v.some((m) => m.includes('Makefile')));
});

test('rejects file over 5 MB', () => {
  const v = run([f('posts/alice/new/data.csv', 5_000_001), f('posts/alice/new/ok.csv', 5_000_000)], { head: { 'alice/new': ['alice'] } });
  assert.equal(v.length, 1);
  assert.match(v[0], /data\.csv/);
});

test('rejects post over 25 MB', () => {
  const files = Array.from({ length: 6 }, (_, i) => f(`posts/alice/new/d${i}.csv`, 4_500_000));
  const v = run(files, { head: { 'alice/new': ['alice'] } });
  assert.equal(v.length, 1);
  assert.match(v[0], /alice\/new.*25/);
  // the whole post's size at head counts, not only the changed files
  const w = checkPr({ changed: [f('posts/alice/new/a.csv', 10)], prAuthor: 'alice', baseAuthors: () => ['alice'], headAuthors: () => ['alice'], postBytes: () => 26_000_000 });
  assert.equal(w.length, 1);
});

test('rejects svg containing script', () => {
  const bad = ['<svg><script>alert(1)</script></svg>', '<svg><rect onload ="x()"/></svg>', '<svg><a href="javascript:x()"/></svg>'];
  for (const content of bad) {
    const v = run([f('posts/alice/new/fig.svg', content.length, { content })], { head: { 'alice/new': ['alice'] } });
    assert.equal(v.length, 1, content);
  }
  assert.deepEqual(run([f('posts/alice/new/fig.svg', 30, { content: '<svg><rect width="1"/></svg>' })], { head: { 'alice/new': ['alice'] } }), []);
});

test('rejects symlinks and submodules', () => {
  const v = run([f('posts/alice/new/link.py', 10, { mode: '120000' }), f('posts/alice/new/sub.py', 0, { mode: '160000' })], { head: { 'alice/new': ['alice'] } });
  assert.equal(v.length, 2);
});

test('checklist lists checks, posts, refcheck, manual items and PR number', () => {
  const md = checklistMd({
    pr: 42, violations: ['x.md: outside posts/<user>/<slug>/'],
    results: [{ name: 'npm test', outcome: 'success' }, { name: 'build:drafts', outcome: 'failure' }],
    posts: [{ id: 'alice/new', badge: false, reasons: ['no delta.yaml'], refcheck: 'retry', inBuild: true }],
  });
  assert.match(md, /#42/);
  assert.match(md, /npm test.*success/);
  assert.match(md, /build:drafts.*failure/);
  assert.match(md, /x\.md: outside/);
  assert.match(md, /alice\/new/);
  assert.match(md, /no delta\.yaml/);
  assert.match(md, /retry/);
  for (const item of ['claims match cited sources', 'AI & contribution statement plausible', 'author verification is specific']) assert.ok(md.includes(`- [ ] ${item}`), item);
});

// ---------- CLI against a throwaway git repo ----------
const FM = (authors) => `---\ntitle: T\nauthors: [${authors.join(', ')}]\n---\n\n## Question\n`;
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-pr-'));
  const git = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com'); git('config', 'user.name', 't');
  const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), s); };
  write('posts/bob/old/index.md', FM(['bob']));
  write('posts/bob/old/run.py', 'print(1)\n');
  write('refcache.json', '{}\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  return { d, git, write, base: git('rev-parse', 'HEAD') };
}
const cli = (d, argv) => {
  const out = [];
  const code = runCli(argv, { cwd: d, log: (s) => out.push(s) });
  return { code, out: out.join('\n'), md: fs.existsSync(path.join(d, 'pr-report/checklist.md')) ? fs.readFileSync(path.join(d, 'pr-report/checklist.md'), 'utf8') : '' };
};

test('cli: accepts a new own post and writes the checklist + pr-number', () => {
  const r = repo();
  r.write('posts/alice/new/index.md', FM(['alice']));
  r.write('posts/alice/new/run.py', 'print(2)\n');
  r.write('posts/alice/new/.refcheck-status', 'ok\n');
  fs.mkdirSync(path.join(r.d, 'pr-report'));
  fs.writeFileSync(path.join(r.d, 'pr-report/build.json'), JSON.stringify({ errors: [], warnings: [], posts: [{ id: 'alice/new', badge: false, reasons: ['no delta.yaml'] }] }));
  r.git('add', 'posts/alice/new/index.md', 'posts/alice/new/run.py'); r.git('commit', '-q', '-m', 'new');
  const head = r.git('rev-parse', 'HEAD');
  const { code, md } = cli(r.d, ['--base', r.base, '--head', head, '--author', 'alice', '--pr', '7', '--build-summary', 'pr-report/build.json', '--result', 'npm test=success']);
  assert.equal(code, 0);
  assert.match(md, /#7/);
  assert.match(md, /alice\/new/);
  assert.match(md, /no delta\.yaml/);
  assert.match(md, /\bok\b/);
  assert.match(md, /npm test.*success/);
  assert.equal(fs.readFileSync(path.join(r.d, 'pr-report/pr-number'), 'utf8').trim(), '7');
  // --list-posts prints changed post dirs that exist at head
  const out = [];
  assert.equal(runCli(['--base', r.base, '--head', head, '--list-posts'], { cwd: r.d, log: (s) => out.push(s) }), 0);
  assert.deepEqual(out, ['posts/alice/new']);
});

test('cli: rejects editing refcache.json and another user\'s post, reads base authors', () => {
  const r = repo();
  r.write('refcache.json', '{"doi:x":{"verified":true}}\n');
  r.write('posts/bob/old/index.md', FM(['bob', 'alice']));
  r.git('add', '-A'); r.git('commit', '-q', '-m', 'sneaky');
  const head = r.git('rev-parse', 'HEAD');
  const { code, md } = cli(r.d, ['--base', r.base, '--head', head, '--author', 'alice', '--pr', '8']);
  assert.equal(code, 1);
  assert.match(md, /refcache\.json/);
  assert.match(md, /bob\/old/);
});

test('cli: co-author deletes a file and renames are seen as delete + add', () => {
  const r = repo();
  r.write('posts/bob/old/index.md', FM(['bob', 'alice']));
  r.git('add', '-A'); r.git('commit', '-q', '-m', 'add alice');
  const base = r.git('rev-parse', 'HEAD');
  r.git('rm', '-q', 'posts/bob/old/run.py');
  r.git('commit', '-q', '-m', 'del');
  assert.equal(cli(r.d, ['--base', base, '--head', r.git('rev-parse', 'HEAD'), '--author', 'alice', '--pr', '9']).code, 0);
  // carol moves bob's file into her own post: the deletion in bob's post is caught
  r.write('posts/carol/mine/index.md', FM(['carol']));
  r.git('mv', 'posts/bob/old/index.md', 'posts/carol/mine/stolen.md');
  r.git('add', '-A'); r.git('commit', '-q', '-m', 'mv');
  const v = cli(r.d, ['--base', base, '--head', r.git('rev-parse', 'HEAD'), '--author', 'carol', '--pr', '10']);
  assert.equal(v.code, 1);
  assert.match(v.md, /bob\/old/);
});

test('cli: rejects invalid --pr', () => {
  const r = repo();
  assert.equal(cli(r.d, ['--base', r.base, '--head', r.base, '--author', 'alice', '--pr', '7; rm -rf /']).code, 1);
});
