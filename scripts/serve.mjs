// Local preview: rebuilds (with drafts) on change and serves dist/ at http://localhost:4321
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 4321);
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.xml': 'application/xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.csv': 'text/csv' };

// URL -> file path under dist: { path } or { status: 400 | 403 }
export function resolveRequest(dist, url) {
  let rel;
  try { rel = decodeURIComponent(new URL(url, 'http://x').pathname); } catch { return { status: 400 }; }
  const p = path.join(dist, rel);
  return p === dist || p.startsWith(dist + path.sep) ? { path: p } : { status: 403 };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rebuild = () => spawnSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--drafts', '--allow-unverified'], { stdio: 'inherit' });
  rebuild();

  let timer;
  for (const dir of ['posts', 'static', 'about.md', 'site.config.json']) {
    const p = path.join(ROOT, dir);
    if (fs.existsSync(p)) fs.watch(p, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(rebuild, 200); });
  }

  http.createServer((req, res) => {
    const r = resolveRequest(DIST, req.url);
    if (r.status) { res.writeHead(r.status).end(); return; }
    let p = r.path;
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }).listen(PORT, () => console.log(`Preview at http://localhost:${PORT} (drafts and unverified refs allowed)`));
}
