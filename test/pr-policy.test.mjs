import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkPr, ALLOWED_EXTENSIONS, LIMITS, checklistMd, svgProblem } from '../scripts/lib/pr-policy.mjs';
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
  // a new post's folder must match the login exactly; existing posts compare case-insensitively
  assert.ok(run([f('posts/Alice/fresh/index.md')], { head: { 'Alice/fresh': ['alice'] } }).length > 0);
  assert.deepEqual(run([f('posts/bob/old/index.md')], { prAuthor: 'Alice', base: { 'bob/old': ['bob', 'alice'] } }), []);
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

const svgV = (content, name = 'fig.svg') => run([f(`posts/alice/new/${name}`, content.length, { content })], { head: { 'alice/new': ['alice'] } });
const NS = 'xmlns="http://www.w3.org/2000/svg"';

test('rejects svg containing script', () => {
  const bad = {
    plain: `<svg ${NS}><script>alert(1)</script></svg>`,
    handler: `<svg ${NS}><rect onload ="x()"/></svg>`,
    anchor: `<svg ${NS}><a href="javascript:x()"><text>x</text></a></svg>`,
    namespacedScript: `<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></s:svg>`,
    namespacedScriptInSvg: `<svg ${NS} xmlns:h="http://www.w3.org/1999/xhtml"><h:script>alert(1)</h:script></svg>`,
    charRefScheme: `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="&#106;avascript:alert(1)"/></svg>`,
    tabInScheme: `<svg ${NS}><image href="java\tscript:alert(1)"/></svg>`,
    foreignObject: `<svg ${NS}><foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" srcdoc="x"/></foreignObject></svg>`,
    doctypeEntity: `<!DOCTYPE svg [<!ENTITY x "&#60;script&#62;alert(1)&#60;/script&#62;">]><svg ${NS}>&x;</svg>`,
    styleElement: `<svg ${NS}><style>rect{fill:red}</style></svg>`,
    styleUrl: `<svg ${NS}><rect style="fill:url(https://evil.example/x)"/></svg>`,
    animate: `<svg ${NS}><rect><set attributeName="href" to="javascript:x()"/></rect></svg>`,
    externalImage: `<svg ${NS}><image href="https://evil.example/track.png"/></svg>`,
    protocolRelative: `<svg ${NS}><image href="//evil.example/x.png"/></svg>`,
    parentPath: `<svg ${NS}><image href="../../bob/old/x.png"/></svg>`,
    xhtmlDefaultNs: `<svg xmlns="http://www.w3.org/1999/xhtml"><title>x</title></svg>`,
    stylesheetPi: `<?xml-stylesheet href="x.css"?><svg ${NS}/>`,
    unquotedAttr: `<svg ${NS}><rect width=1/></svg>`,
  };
  for (const [k, content] of Object.entries(bad)) assert.equal(svgV(content).length, 1, k);
  // uppercase extension is still an SVG
  assert.equal(svgV(bad.plain, 'FIG.SVG').length, 1);
});

test('accepts a benign matplotlib-style svg', () => {
  const ok = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<!-- Created with matplotlib (https://matplotlib.org/) -->
<svg xmlns:xlink="http://www.w3.org/1999/xlink" width="460.8pt" height="345.6pt" viewBox="0 0 460.8 345.6" ${NS} version="1.1">
 <defs>
  <clipPath id="p1"><rect x="57.6" y="41.47" width="357.12" height="266.11"/></clipPath>
  <path id="m0" d="M 0 0 L 0 3.5" style="stroke: #000000; stroke-width: 0.8"/>
 </defs>
 <g id="figure_1">
  <path d="M 0 345.6 L 460.8 345.6 L 460.8 0 L 0 0 z" style="fill: #ffffff"/>
  <use xlink:href="#m0" x="73.83" y="307.58" style="stroke: #000000"/>
  <use href="#m0" x="80" y="307.58"/>
  <image href="inset.png" x="0" y="0" width="10" height="10"/>
  <polyline points="1,2 3,4" clip-path="url(#p1)" fill="none"/>
  <text x="10" y="20" style="font-size: 10px; font-family: 'DejaVu Sans'">n_iterations=100 &amp; error &lt; 1e-3, onset = 2</text>
  <![CDATA[ ignored <script> text ]]>
 </g>
</svg>
`;
  assert.deepEqual(svgV(ok), []);
  assert.equal(svgProblem(ok), null);
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

test('cli: folder names are matched literally, never as pathspec globs', () => {
  const r = repo();
  r.write('posts/bob/o*/index.md', FM(['bob']));
  r.write('posts/bob/o*/run.py', 'print(3)\n');
  r.git('add', '-A'); r.git('commit', '-q', '-m', 'glob-named post');
  const { code, md } = cli(r.d, ['--base', r.base, '--head', r.git('rev-parse', 'HEAD'), '--author', 'bob', '--pr', '11']);
  assert.equal(code, 0, md);
});
