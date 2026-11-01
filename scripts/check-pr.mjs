// PR policy check + moderator checklist for CI.
// Usage: node scripts/check-pr.mjs --base <sha> --head <sha> --author <login> --pr <n>
//          [--build-summary <json>] [--result "<check>=<outcome>"]... [--out pr-report]
//        node scripts/check-pr.mjs --base <sha> --head <sha> --list-posts
// Reads the PR's changes from git (never from the working tree, except .refcheck-status written by check-refs),
// writes <out>/checklist.md and <out>/pr-number, and exits 1 on any policy violation.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { checkPr, checklistMd, postOf } from './lib/pr-policy.mjs';

const USAGE = 'usage: node scripts/check-pr.mjs --base <sha> --head <sha> (--author <login> --pr <n> | --list-posts)';

function parseArgs(argv) {
  const o = { result: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list-posts') o.listPosts = true;
    else if (a === '--result') o.result.push(argv[++i]);
    else if (a.startsWith('--')) o[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return o;
}

// Returns the process exit code. cwd / log are injectable for tests.
export function runCli(argv, { cwd = process.cwd(), log = console.log } = {}) {
  const o = parseArgs(argv);
  if (!o.base || !o.head || (!o.listPosts && (!o.author || !o.pr))) { console.error(USAGE); return 1; }
  if (!o.listPosts && !/^[1-9]\d{0,9}$/.test(o.pr)) { console.error(`--pr must be a PR number, got "${o.pr}"`); return 1; }
  // folder names are attacker-chosen: pathspecs are always literal
  const env = { ...process.env, GIT_LITERAL_PATHSPECS: '1' };
  const git = (...a) => execFileSync('git', a, { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
  const [base, head] = [o.base, o.head].map((r) => git('rev-parse', '--verify', '--end-of-options', `${r}^{commit}`).trim());

  // changed files (renames split into delete + add so the source folder is checked too)
  const z = git('diff', '--name-status', '-z', '--no-renames', '--diff-filter=ACDMRT', `${base}...${head}`).split('\0');
  const diff = [];
  for (let i = 0; i + 1 < z.length; i += 2) diff.push({ status: z[i], path: z[i + 1] });
  // modes and sizes of every file under posts/ at head
  const tree = new Map();
  for (const line of git('ls-tree', '-r', '-l', '-z', head, '--', 'posts').split('\0').filter(Boolean)) {
    const [meta, p] = [line.slice(0, line.indexOf('\t')), line.slice(line.indexOf('\t') + 1)];
    const [mode, , , size] = meta.split(/\s+/);
    tree.set(p, { mode, size: Number(size) || 0 });
  }
  const postIds = [...new Set(diff.map((d) => postOf(d.path)?.id).filter(Boolean))].sort();
  const atHead = postIds.filter((id) => [...tree.keys()].some((p) => p.startsWith(`posts/${id}/`)));

  if (o.listPosts) { for (const id of atHead) log(`posts/${id}`); return 0; }

  const authorsAt = (rev, id) => {
    if (tryGit('cat-file', '-e', `${rev}:posts/${id}`) === null) return null;
    const src = tryGit('show', `${rev}:posts/${id}/index.md`);
    let a = [];
    try { a = src ? matter(src).data.authors : []; } catch {}
    return Array.isArray(a) ? a.map(String) : [];
  };
  const changed = diff.map((d) => {
    if (d.status === 'D') return { path: d.path, size: 0, deleted: true };
    const t = tree.get(d.path) ?? { mode: tryGit('ls-tree', head, '--', d.path)?.split(/\s+/)[0], size: Number(tryGit('cat-file', '-s', `${head}:${d.path}`)) || 0 };
    const f = { path: d.path, size: t.size, mode: t.mode };
    if (/\.svg$/i.test(d.path)) f.content = tryGit('show', `${head}:${d.path}`) ?? '';
    return f;
  });
  const postBytes = (id) => [...tree].filter(([p]) => p.startsWith(`posts/${id}/`)).reduce((s, [, t]) => s + t.size, 0);
  const violations = checkPr({ changed, prAuthor: o.author, baseAuthors: (id) => authorsAt(base, id), headAuthors: (id) => authorsAt(head, id) ?? [], postBytes });

  // build summary (from `npm run build:drafts -- --summary <file>`) and per-post .refcheck-status
  let summary = null;
  try { summary = JSON.parse(fs.readFileSync(path.resolve(cwd, o.buildSummary), 'utf8')); } catch {}
  const posts = atHead.map((id) => {
    const built = summary?.posts?.find((p) => p.id === id);
    let refcheck = tree.has(`posts/${id}/refs.json`) ? 'not run' : 'no refs.json';
    try { refcheck = fs.readFileSync(path.join(cwd, 'posts', id, '.refcheck-status'), 'utf8').trim() || refcheck; } catch {}
    return { id, inBuild: !!built, badge: !!built?.badge, reasons: built?.reasons ?? [], refcheck };
  });
  const results = o.result.filter(Boolean).map((r) => ({ name: r.slice(0, r.lastIndexOf('=')), outcome: r.slice(r.lastIndexOf('=') + 1) }));
  const md = checklistMd({ pr: o.pr, violations, results, posts, buildErrors: summary?.errors ?? [], files: diff.map((d) => `${d.status} ${d.path}`) });

  const out = path.resolve(cwd, o.out ?? 'pr-report');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'checklist.md'), md);
  fs.writeFileSync(path.join(out, 'pr-number'), `${o.pr}\n`);
  for (const m of violations) log(`::error::${m.replace(/[\r\n]+/g, ' ')}`);
  log(violations.length ? `PR policy: ${violations.length} violation(s)` : 'PR policy: passed');
  return violations.length ? 1 : 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(runCli(process.argv.slice(2)));
