import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixture } from './helpers.mjs';

test('builds nested user/slug posts', () => {
  const { outDir, result } = buildFixture();
  assert.deepEqual(result.errors, []);
  assert.ok(fs.existsSync(path.join(outDir, 'posts/alice/hello/index.html')));
  assert.equal(result.posts[0].id, 'alice/hello');
  assert.equal(result.posts[0].user, 'alice');
  assert.equal(result.posts[0].slug, 'hello');
});
