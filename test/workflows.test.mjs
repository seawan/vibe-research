// Structural checks on the GitHub Actions workflows (no external validator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.github/workflows');
const load = (n) => yaml.load(fs.readFileSync(path.join(DIR, n), 'utf8'));
const steps = (wf) => Object.values(wf.jobs).flatMap((j) => j.steps ?? []);
const runs = (wf) => steps(wf).map((s) => s.run ?? '').join('\n');

test('pr-check: pull_request only, read-only token, uploads both artifacts', () => {
  const wf = load('pr-check.yml');
  assert.equal(wf.name, 'PR checks');
  assert.deepEqual(Object.keys(wf.on), ['pull_request']);
  assert.deepEqual(wf.permissions, { contents: 'read' });
  for (const j of Object.values(wf.jobs)) assert.equal(j.permissions, undefined);
  const co = steps(wf).find((s) => String(s.uses).startsWith('actions/checkout'));
  assert.equal(co.with['fetch-depth'], 0);
  const r = runs(wf);
  for (const s of ['npm ci', 'npm test', 'scripts/check-pr.mjs', 'check-refs.mjs', '--ci', '--cache', 'build:drafts']) assert.ok(r.includes(s), s);
  // refcache.json comes from the base branch, never the PR head
  assert.match(r, /git show "\$BASE:refcache\.json"/);
  const uploads = steps(wf).filter((s) => String(s.uses).startsWith('actions/upload-artifact')).map((s) => s.with.name);
  assert.deepEqual(uploads.sort(), ['pr-report', 'site-preview']);
  // no ${{ }} expressions inside run scripts: inputs go through env
  for (const s of steps(wf)) if (s.run) assert.ok(!s.run.includes('${{'), s.run);
});

test('pr-comment: workflow_run on PR checks, minimal permissions, never runs PR code', () => {
  const wf = load('pr-comment.yml');
  assert.deepEqual(Object.keys(wf.on), ['workflow_run']);
  assert.deepEqual(wf.on.workflow_run.workflows, ['PR checks']);
  assert.deepEqual(wf.on.workflow_run.types, ['completed']);
  assert.deepEqual(wf.permissions, { 'pull-requests': 'write', actions: 'read' });
  for (const j of Object.values(wf.jobs)) {
    assert.equal(j.permissions, undefined);
    assert.match(String(j.if), /github\.event\.workflow_run\.event == 'pull_request'/);
  }
  for (const s of steps(wf)) {
    assert.ok(!String(s.uses ?? '').startsWith('actions/checkout'), 'no checkout');
    assert.ok(!/\b(npm|npx|node)\b/.test(s.run ?? ''), `no npm/node: ${s.run}`);
    if (s.run) assert.ok(!s.run.includes('${{'), 'no ${{ }} in run scripts');
  }
  const dl = steps(wf).filter((s) => String(s.uses).startsWith('actions/download-artifact'));
  assert.equal(dl.length, 1);
  assert.equal(dl[0].with.name, 'pr-report');
  const r = runs(wf);
  assert.ok(r.includes('<!-- vibe-research-report -->'));
  assert.ok(r.includes('--body-file'));
  assert.match(r, /\^\[1-9\]\[0-9\]/, 'PR number validated as an integer');
  // trusted section (API file list, run conclusion/URL) comes before the untrusted artifact, which is fenced
  const iTrusted = r.indexOf('pulls/$pr/files');
  const iNote = r.indexOf('not trusted');
  const iArtifact = r.indexOf('$REPORT/checklist.md');
  assert.ok(iTrusted > 0 && r.indexOf('$RUN_URL') < iNote && r.indexOf('$CONCLUSION') < iNote && iTrusted < iNote && iNote < iArtifact);
  assert.ok(r.indexOf("echo '---'") < iNote);
  // untrusted checklist: backticks replaced, fixed ``` fence, byte caps on both lists
  assert.ok(r.includes(`tr '\`' "'"`), 'backticks in the checklist replaced');
  assert.ok(r.includes("echo '```markdown'") && r.includes("echo '```'"), 'fixed fence');
  assert.doesNotMatch(r, /longest/);
  assert.match(r, /head -c 40000 "\$REPORT\/checklist\.md"/);
  assert.match(r, /head -c 8000/, 'outside-files list capped by bytes');
  assert.match(r, /3000/, 'API file-list cap handled');
  // trusted header names the commit checked, before the untrusted part
  const iSha = r.indexOf('Checked commit');
  assert.ok(iSha > 0 && iSha < iNote && /HEAD_SHA:0:7|short_sha/.test(r));
  // full body failure falls back to a short trusted-only body instead of leaving the old comment
  assert.match(r, /too large\/failed/);
  const iFallback = r.indexOf('too large/failed');
  assert.ok(r.indexOf('$RUN_URL', iFallback - 2000) >= 0);
  assert.ok(r.includes('--input "$RUNNER_TEMP/payload.json"') && r.includes('--body-file "$1"'), 'post() uses --input / --body-file');
  assert.ok(r.indexOf('if post "$body"') < r.indexOf('post "$short"'), 'fallback posts the short body after the full one fails');
});

test('pr-check: report artifact survives early failures', () => {
  const wf = load('pr-check.yml');
  const st = steps(wf);
  const iFallback = st.findIndex((s) => /pr-report\/pr-number/.test(s.run ?? ''));
  assert.ok(iFallback >= 0 && iFallback < st.findIndex((s) => s.run === 'npm ci'));
  assert.equal(st.find((s) => s.id === 'posts')['continue-on-error'], true);
  for (const s of st.filter((s) => String(s.uses).startsWith('actions/upload-artifact'))) assert.equal(s.if, 'always()');
});

test('deploy: push to main + dispatch, full history, tests before build', () => {
  const wf = load('deploy.yml');
  assert.deepEqual(wf.on.push.branches, ['main']);
  assert.ok('workflow_dispatch' in wf.on);
  assert.deepEqual(Object.keys(wf.on).sort(), ['push', 'workflow_dispatch']);
  const st = wf.jobs.build.steps;
  const co = st.find((s) => String(s.uses).startsWith('actions/checkout'));
  assert.equal(co.with['fetch-depth'], 0);
  assert.equal(st.find((s) => String(s.uses).startsWith('actions/setup-node')).with['node-version'], 22);
  const iTest = st.findIndex((s) => s.run === 'npm test');
  const iBuild = st.findIndex((s) => s.run === 'npm run build');
  assert.ok(iTest >= 0 && iBuild > iTest);
  assert.ok(wf.jobs.deploy);
  // least privilege: only the deploy job can write Pages / mint an OIDC token
  assert.equal(wf.permissions?.pages, undefined);
  assert.equal(wf.permissions?.['id-token'], undefined);
  assert.deepEqual(wf.jobs.build.permissions, { contents: 'read' });
  assert.deepEqual(wf.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
});
