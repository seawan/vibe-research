import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveRequest } from '../scripts/serve.mjs';

test('serve: malformed escapes are 400, paths outside dist (incl. sibling prefixes) are 403', () => {
  const dist = path.join(path.sep, 'x', 'dist');
  assert.equal(resolveRequest(dist, '/%E0%A4%A').status, 400);
  assert.equal(resolveRequest(dist, '/..%2f..%2fetc/passwd').status, 403);
  assert.equal(resolveRequest(dist, '/..%2fdist-secret/a').status, 403);
  assert.equal(resolveRequest(dist, '/posts/a/b/').path, path.join(dist, 'posts/a/b/'));
  assert.equal(resolveRequest(dist, '/').path, dist + path.sep);
});
