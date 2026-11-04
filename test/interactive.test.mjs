import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expandInteractive, parseCsv, srcdoc } from '../scripts/lib/interactive.mjs';

function setup(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-int-'));
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
  const problems = [];
  return { dir, problems, run: (md, outputs = ['d.json']) => expandInteractive(md, { dir, outputs, report: (m) => problems.push(m) }) };
}
const payload = (out) => JSON.parse(decodeURIComponent(/^@@interactive (\S+)/m.exec(out)[1]));

test('an @interactive line becomes a sandbox document holding only the chosen keys', () => {
  const { run, problems } = setup({ 'w.js': 'go()', 'd.json': '{"a":1,"secret":2}' });
  const { doc, caption, height } = payload(run('@interactive w.js#one data=d.json:a height=500 "A *caption*"'));
  assert.deepEqual(problems, []);
  assert.equal(caption, 'A *caption*');
  assert.equal(height, 500);
  assert.match(doc, /default-src 'none'/);
  assert.match(doc, /"d\.json":\{"a":1\}/);
  assert.doesNotMatch(doc, /secret/);
});

test('data must be a listed output, exist and hold the asked keys', () => {
  const { run, problems } = setup({ 'w.js': 'go()', 'd.json': '{"a":1}', 'e.json': '{}' });
  run('@interactive w.js#one data=e.json,nope.json,d.json:zzz "c"', ['d.json', 'nope.json']);
  assert.ok(problems.some((m) => m.includes('"e.json" is not listed in outputs')));
  assert.ok(problems.some((m) => m.includes('"nope.json" not found')));
  assert.ok(problems.some((m) => m.includes('no key zzz')));
});

test('a script cannot escape its tag, and paths stay inside the post', () => {
  const { run, problems } = setup({ 'bad.js': 'x="</script><b>"', 'd.json': '{}' });
  assert.match(run('@interactive bad.js#one "c"'), /^@interactive/);
  assert.match(run('@interactive ../x.js#one "c"'), /^@interactive/);
  assert.match(run('@interactive w.js#one data=../../d.json "c"', []), /^@interactive/);
  assert.equal(problems.length, 3);
});

test('data cannot close the script tag', () => {
  const doc = srcdoc({ code: '', name: 'n', data: { t: '</script><img src=x>' } });
  assert.doesNotMatch(doc, /<\/script><img/);
  assert.match(doc, /\\u003c\/script/);
});

test('kit=lesson adds the lesson kit only when asked for', () => {
  const { run } = setup({ 'w.js': 'go()' });
  assert.match(payload(run('@interactive w.js#one kit=lesson "c"', [])).doc, /function lesson\(/);
  assert.doesNotMatch(payload(run('@interactive w.js#one "c"', [])).doc, /function lesson\(/);
});

test('pictures from outputs arrive as data URLs', () => {
  const { run } = setup({ 'w.js': 'go()', 'p.png': 'abc' });
  assert.match(payload(run('@interactive w.js#one data=p.png "c"', ['p.png'])).doc, /"p\.png":"data:image\/png;base64,YWJj"/);
});

test('parseCsv turns numbers into numbers', () => {
  assert.deepEqual(parseCsv('a,b\n1,x\n2.5,y\n'), [{ a: 1, b: 'x' }, { a: 2.5, b: 'y' }]);
});
