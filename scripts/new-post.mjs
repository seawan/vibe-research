// Scaffold a new post: node scripts/new-post.mjs [--user <login>] "Post title"
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let user = '';
const ui = args.findIndex((a) => a === '--user' || a.startsWith('--user='));
if (ui >= 0) {
  if (args[ui] === '--user') { user = (args[ui + 1] || '').trim(); args.splice(ui, 2); }
  else { user = args[ui].slice(7).trim(); args.splice(ui, 1); }
}
const title = args.join(' ').trim();
if (!title) { console.error('usage: npm run new -- [--user <github-login>] "Post title"'); process.exit(1); }
if (!user) {
  try { user = execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* handled below */ }
  if (!user) { console.error('Could not get your GitHub login from `gh api user`. Run `gh auth login`, or pass --user <github-login>.'); process.exit(1); }
}
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(user)) { console.error(`"${user}" is not a valid GitHub login`); process.exit(1); }
const slug = title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
if (!slug) { console.error('the title must contain letters or digits'); process.exit(1); }
const dir = path.join(ROOT, 'posts', user, slug);
if (fs.existsSync(dir)) { console.error(`posts/${user}/${slug} already exists`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const template = fs.readFileSync(path.join(ROOT, 'templates/post.md'), 'utf8')
  .replaceAll('{{title}}', () => title.replace(/\\/g, '\\\\').replace(/"/g, '\\"'))
  .replaceAll('{{date}}', () => today)
  .replaceAll('{{user}}', () => user);
fs.writeFileSync(path.join(dir, 'index.md'), template);
fs.writeFileSync(path.join(dir, 'refs.json'), '[]\n');
console.log(`Created posts/${user}/${slug}/ (index.md, refs.json). Put code, data and figures in the same folder, and chat excerpts in chat/.`);
