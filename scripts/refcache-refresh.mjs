// Maintainer tool: re-check the references of every post and fill refcache.json at the repo root.
// Usage (on main): npm run refcache:refresh, then commit refcache.json. CI reads the base branch's copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './check-refs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort() : []);

// Runs check-refs (non-CI) on posts/<user>/<slug>/ folders that have refs.json; returns 1 if any post has unverified refs.
export async function refreshAll({ postsDir = path.join(ROOT, 'posts'), cachePath = path.join(ROOT, 'refcache.json'), fetchImpl = fetch, fast = false, log = console.log } = {}) {
  let code = 0;
  for (const u of dirs(postsDir)) for (const s of dirs(path.join(postsDir, u))) {
    const dir = path.join(postsDir, u, s);
    if (!fs.existsSync(path.join(dir, 'refs.json'))) continue;
    log(`\n== ${u}/${s}`);
    code = Math.max(code, await runCli([dir], { fetchImpl, cachePath, fast, log }));
  }
  log(`\nrefcache written to ${cachePath}`);
  return code;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await refreshAll());
