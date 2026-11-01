import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePost } from '../scripts/lib/post-schema.mjs';

const validFm = () => ({
  authors: ['alice'],
  ai: [{ name: 'Claude', model: 'claude-opus-4', role: 'wrote the code and draft' }],
  contribution: 'Alice posed the question and checked every number; Claude wrote the script.',
  license: 'CC-BY-4.0',
  code_license: 'MIT',
  author_verification: { verified: true, by: 'alice', date: '2026-11-01', checked: 'Reran add.py locally and compared the printed value with Results.' },
});
const validMd = () => '## The question\n\nq\n\n## What we did\n\nw\n\n## Results\n\nr\n';
const validFiles = () => ['index.md', 'add.py', 'chat/notes.md'];
const run = (o = {}) => validatePost({ fm: validFm(), markdown: validMd(), folderUser: 'alice', files: validFiles(), ...o });
const has = (errs, s) => assert.ok(errs.some((x) => x.includes(s)), `expected an error containing "${s}", got ${JSON.stringify(errs)}`);

test('accepts a valid post', () => assert.deepEqual(run(), []));
test('rejects missing ai', () => { const fm = validFm(); delete fm.ai; has(run({ fm }), 'ai:'); });
test('rejects authors[0] not folder owner', () => { const fm = validFm(); fm.authors = ['bob', 'alice']; has(run({ fm }), 'authors:'); });
test('rejects license outside allowlist', () => { const fm = validFm(); fm.license = 'GPL-3.0'; has(run({ fm }), 'license:'); });
test('rejects missing code_license', () => { const fm = validFm(); delete fm.code_license; has(run({ fm }), 'code_license:'); });
test('rejects unverified author_verification', () => { const fm = validFm(); fm.author_verification.verified = false; has(run({ fm }), 'author_verification.verified'); });
test('rejects boilerplate checked text', () => { const fm = validFm(); fm.author_verification.checked = 'Looks good '; has(run({ fm }), 'author_verification.checked'); });
test('rejects verifier not among authors', () => { const fm = validFm(); fm.author_verification.by = 'mallory'; has(run({ fm }), 'author_verification.by'); });
test('rejects future verification date', () => { const fm = validFm(); fm.author_verification.date = '2999-01-01'; has(run({ fm }), 'future'); });
test('accepts Date objects from YAML', () => { const fm = validFm(); fm.author_verification.date = new Date('2026-10-01'); assert.deepEqual(run({ fm }), []); });
test('rejects sections out of order', () => has(run({ markdown: '## Results\n\nr\n\n## The question\n\nq\n\n## What we did\n\nw\n' }), 'out of order'));
test('rejects hand-written Reproduce section', () => has(run({ markdown: validMd() + '\n## Reproduce\n\nrun it\n' }), 'Reproduce'));
test('allows extra sections between required ones', () => assert.deepEqual(run({ markdown: '## The question\n\nq\n\n## Background\n\nb\n\n## Method\n\nw\n\n## Discussion\n\nd\n\n## Results\n\nr\n' }), []));
test('ignores headings inside code fences', () => has(run({ markdown: '## The question\n\n```\n## What we did\n## Results\n```\n' }), 'What we did'));
test('requires a code file', () => has(run({ files: ['index.md', 'chat/notes.md'] }), 'code:'));
test('requires chat excerpt or chat link', () => {
  has(run({ files: ['index.md', 'add.py'] }), 'chat:');
  const fm = validFm(); fm.chat_links = ['https://example.com/c/1'];
  assert.deepEqual(run({ fm, files: ['index.md', 'add.py'] }), []);
});
