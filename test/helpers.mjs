// Test helpers: build a fixture posts tree into a temp dir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function buildFixture(name = 'posts') {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-test-'));
  const result = buildSite({ postsDir: path.join(FIXTURES, name), outDir });
  return { outDir, result };
}
