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

// Make a file symlink, or skip test `t` where the OS refuses (Windows without
// admin or Developer Mode throws EPERM). Returns whether the link was made.
export function trySymlink(t, target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath);
    return true;
  } catch (e) {
    if (e.code !== 'EPERM') throw e;
    t.skip('this OS does not let the current user create symlinks (EPERM)');
    return false;
  }
}
