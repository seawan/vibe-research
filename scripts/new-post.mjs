// Scaffold a new post: node scripts/new-post.mjs "Post title"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const title = process.argv.slice(2).join(' ').trim();
if (!title) { console.error('usage: npm run new -- "Post title"'); process.exit(1); }
const slug = title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
const dir = path.join(ROOT, 'posts', slug);
if (fs.existsSync(dir)) { console.error(`posts/${slug} already exists`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const template = fs.readFileSync(path.join(ROOT, 'templates/post.md'), 'utf8')
  .replace('{{title}}', title.replace(/"/g, '\\"'))
  .replace('{{date}}', today);
fs.writeFileSync(path.join(dir, 'index.md'), template);
fs.writeFileSync(path.join(dir, 'refs.json'), '[]\n');
console.log(`Created posts/${slug}/ (index.md, refs.json). Put figures and data files in the same folder.`);
