import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rerun, resolvePostDir } from '../scripts/lib/rerun.mjs';
import { DeltaError, parseOutput, deltaCli } from '../scripts/lib/delta-cli.mjs';
import { runCli } from '../scripts/vibe-rerun.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'posts', 'alice', 'hello');
const quiet = { log: () => {}, warn: () => {} };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-rerun-'));
const copyHello = () => { const d = path.join(tmp(), 'hello'); fs.cpSync(FIX, d, { recursive: true }); return d; };
const sub = (args) => (args[0] === 'sandbox' ? args[1] : args[0]);
const flag = (args, f) => args[args.indexOf(f) + 1];

// Post with an upload subdir, two outputs and expected values.
function twoOutputPost() {
  const d = path.join(tmp(), 'two');
  fs.mkdirSync(path.join(d, 'code'), { recursive: true });
  fs.writeFileSync(path.join(d, 'delta.yaml'), [
    'version: 1', 'deployment: domestic',
    'sandbox: { image: "Python 3.11 (CPU)", cpu: 2, memory: 4Gi, gpu: 0, max_life: 30 }',
    'upload: code', 'setup: "pip install numpy"', 'command: "python run.py"', 'timeout: 120',
    'outputs: [a.txt, b.txt]',
    'expected: { rel_tolerance: 0.05, values: { metrics.err: 1.0, name: x } }', '',
  ].join('\n'));
  fs.writeFileSync(path.join(d, 'code', 'run.py'), 'print(1)\n');
  fs.writeFileSync(path.join(d, 'code', 'a.txt'), 'A\n');
  fs.writeFileSync(path.join(d, 'code', 'b.txt'), 'B\n');
  return d;
}

// Fake delta-cli: records argv, returns canned envelopes, "pulls" by writing files.
function fakeCli({ exitCode = 0, throwOn = {}, pulled = {}, summary = null, runBg } = {}) {
  const calls = [];
  const cli = async (args) => {
    calls.push(args);
    const s = sub(args);
    if (throwOn[s]) throw throwOn[s];
    switch (s) {
      case '--version': return { json: null, stdout: 'delta-cli version v1.1.17\n' };
      case 'create': return { json: { ok: true, data: { sandbox_id: 'sb-1', image_name: flag(args, '--image-name'), cpu: flag(args, '--cpu'), memory: flag(args, '--memory'), gpu: flag(args, '--gpu') } } };
      case 'working-directory': return { json: { ok: true, data: { path: '/workspace/u1/sb-1' } } };
      case 'upload': return { json: { ok: true, data: {} } };
      case 'run': return flag(args, '--command').startsWith('pip freeze')
        ? { json: { type: 'complete', exit_code: 0, stdout: 'numpy==2.1.0\nscipy==1.14.1\n' } }
        : { json: { type: 'complete', exit_code: 0, stdout: '' } };
      case 'run-bg': if (runBg) return runBg(args);
        return { json: { type: 'complete', exit_code: exitCode, execution_id: 'ex-42', stdout: '', result_summary: summary } };
      case 'pull': {
        const t = flag(args, '--target');
        fs.mkdirSync(path.dirname(t), { recursive: true });
        fs.writeFileSync(t, pulled[path.basename(t)] ?? '3\n');
        return { json: { ok: true, data: {} } };
      }
      case 'kill': return { json: { ok: true, data: {} } };
      default: throw new Error(`unexpected ${args.join(' ')}`);
    }
  };
  cli.calls = calls;
  cli.subs = () => calls.map(sub);
  return cli;
}

test('issues create, upload, run-bg, pull, kill in order', async () => {
  const cli = fakeCli();
  const out = path.join(tmp(), 'out');
  const res = await rerun({ postDir: FIX, mode: 'rerun', outDir: out, cli, signals: new EventEmitter(), ...quiet });
  assert.deepEqual(cli.subs(), ['--version', 'create', 'working-directory', 'upload', 'run-bg', 'run', 'pull', 'kill']);
  const [, create, , upload, runBg, , pull] = cli.calls;
  assert.deepEqual(create, ['sandbox', 'create', '--image-name', 'Python 3.11 (CPU)', '--cpu', '1', '--memory', '2Gi', '--gpu', '0', '--max-life', '10', '--shared-workspace=false']);
  assert.deepEqual(upload, ['sandbox', 'upload', 'sb-1', '--source', path.join(FIX, '.'), '--target', '/workspace/u1/sb-1']);
  assert.deepEqual(runBg, ['sandbox', 'run-bg', 'sb-1', '--command', 'cd /workspace/u1/sb-1 && python add.py', '--timeout', '60', '--wait']);
  assert.deepEqual(pull, ['sandbox', 'pull', 'sb-1', '--source', '/workspace/u1/sb-1/result.txt', '--target', path.join(out, 'result.txt')]);
  assert.equal(res.ok, true);
});

test('setup runs before the command with the upload dir as working directory', async () => {
  const cli = fakeCli({ pulled: { 'a.txt': 'A\n', 'b.txt': 'B\n' }, summary: { metrics: { err: 1.0 }, name: 'x' } });
  await rerun({ postDir: twoOutputPost(), mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals: new EventEmitter(), ...quiet });
  const setup = cli.calls.find((a) => sub(a) === 'run');
  assert.deepEqual(setup, ['sandbox', 'run', 'sb-1', '--command', 'cd /workspace/u1/sb-1 && pip install numpy', '--timeout', '600']);
  assert.ok(cli.subs().indexOf('run') < cli.subs().indexOf('run-bg'));
});

test('kills sandbox when run fails', async () => {
  const cli = fakeCli({ exitCode: 2 });
  const res = await rerun({ postDir: FIX, mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals: new EventEmitter(), ...quiet });
  assert.equal(res.ok, false);
  assert.equal(res.run.exit_code, 2);
  assert.equal(sub(cli.calls.at(-1)), 'kill');
  assert.ok(!cli.subs().includes('pull'));
});

test('kills sandbox when run-bg reports command_failed', async () => {
  const err = new DeltaError('command_failed', 'exit 3', { frame: { type: 'complete', exit_code: 3, execution_id: 'ex-9' } });
  const cli = fakeCli({ throwOn: { 'run-bg': err } });
  const res = await rerun({ postDir: FIX, mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals: new EventEmitter(), ...quiet });
  assert.equal(res.ok, false);
  assert.equal(res.run.exit_code, 3);
  assert.equal(sub(cli.calls.at(-1)), 'kill');
});

test('kills sandbox when upload throws', async () => {
  const cli = fakeCli({ throwOn: { upload: new DeltaError('network', 'boom') } });
  await assert.rejects(rerun({ postDir: FIX, mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals: new EventEmitter(), ...quiet }), /boom/);
  assert.equal(sub(cli.calls.at(-1)), 'kill');
  assert.deepEqual(cli.calls.at(-1), ['sandbox', 'kill', 'sb-1']);
});

test('kill failure is reported loudly and does not mask the original error', async () => {
  const cli = fakeCli({ throwOn: { upload: new DeltaError('network', 'boom'), kill: new DeltaError('api', 'kill refused') } });
  const warned = [];
  await assert.rejects(rerun({ postDir: FIX, mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals: new EventEmitter(), log: () => {}, warn: (m) => warned.push(m) }), /boom/);
  const text = warned.join('\n');
  assert.match(text, /sb-1/);
  assert.match(text, /delta-cli sandbox kill sb-1/);
});

test('kills sandbox on SIGINT', async () => {
  const signals = new EventEmitter();
  let release;
  const cli = fakeCli({ runBg: () => new Promise((r) => { release = r; }) });
  const exits = [];
  const p = rerun({ postDir: FIX, mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals, exit: (c) => exits.push(c), ...quiet });
  while (!cli.subs().includes('run-bg')) await new Promise((r) => setImmediate(r));
  assert.equal(signals.listenerCount('SIGINT'), 1);
  signals.emit('SIGINT');
  const res = await p;
  release({ json: { type: 'complete', exit_code: 0 } });
  await new Promise((r) => setImmediate(r));
  assert.equal(cli.subs().filter((s) => s === 'kill').length, 1);
  assert.deepEqual(exits, [130]);
  assert.equal(res.interrupted, true);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('never creates a second sandbox', async () => {
  for (const opts of [{}, { exitCode: 1 }, { throwOn: { pull: new DeltaError('not_found', 'no file') } }]) {
    const cli = fakeCli(opts);
    await rerun({ postDir: FIX, mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals: new EventEmitter(), ...quiet }).catch(() => {});
    assert.equal(cli.subs().filter((s) => s === 'create').length, 1);
    assert.equal(cli.subs().filter((s) => s === 'kill').length, 1);
  }
});

test('record writes run.json with execution id, resources and packages', async () => {
  const postDir = copyHello();
  const cli = fakeCli({ summary: { sum: 3 }, pulled: { 'result.txt': '4\n' } });
  const times = [new Date('2026-11-01T10:00:00Z'), new Date('2026-11-01T10:00:05Z')];
  const logs = [];
  const res = await rerun({ postDir, mode: 'record', cli, signals: new EventEmitter(), now: () => times.shift() ?? new Date('2026-11-01T10:00:05Z'), log: (m) => logs.push(m), warn: () => {} });
  assert.equal(res.ok, true);
  const run = JSON.parse(fs.readFileSync(path.join(postDir, 'run.json'), 'utf8'));
  assert.deepEqual(run, {
    version: 1, execution_id: 'ex-42',
    sandbox: { image: 'Python 3.11 (CPU)', cpu: 1, memory: '2Gi', gpu: 0, gpu_mem: null, gpu_type: null, deployment: 'overseas' },
    started_at: '2026-11-01T10:00:00.000Z', finished_at: '2026-11-01T10:00:05.000Z', duration_s: 5,
    exit_code: 0, delta_cli_version: 'v1.1.17', packages: ['numpy==2.1.0', 'scipy==1.14.1'], result_summary: { sum: 3 },
  });
  // pulled into the post folder, and the change is announced
  const pull = cli.calls.find((a) => sub(a) === 'pull');
  assert.equal(flag(pull, '--target'), path.join(postDir, '.', 'result.txt'));
  assert.equal(fs.readFileSync(path.join(postDir, 'result.txt'), 'utf8'), '4\n');
  assert.match(logs.join('\n'), /changed.*result\.txt|result\.txt.*changed/);
});

test('record does not write run.json when the run fails', async () => {
  const postDir = copyHello();
  const before = fs.readFileSync(path.join(postDir, 'run.json'), 'utf8');
  const res = await rerun({ postDir, mode: 'record', cli: fakeCli({ exitCode: 1 }), signals: new EventEmitter(), ...quiet });
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(path.join(postDir, 'run.json'), 'utf8'), before);
});

test('rerun compares hashes and expected values', async () => {
  const postDir = twoOutputPost();
  const out = path.join(tmp(), 'o');
  const cli = fakeCli({ pulled: { 'a.txt': 'A\n', 'b.txt': 'different\n' }, summary: { metrics: { err: 1.04 }, name: 'x' } });
  const res = await rerun({ postDir, mode: 'rerun', outDir: out, cli, signals: new EventEmitter(), ...quiet });
  assert.equal(res.ok, false);
  assert.deepEqual(res.comparison.files.map(({ path: p, match }) => ({ path: p, match })), [{ path: 'a.txt', match: true }, { path: 'b.txt', match: false }]);
  assert.deepEqual(res.comparison.values, [
    { key: 'metrics.err', expected: 1.0, got: 1.04, ok: true },
    { key: 'name', expected: 'x', got: 'x', ok: true },
  ]);
  assert.equal(flag(cli.calls.find((a) => sub(a) === 'pull'), '--target'), path.join(out, 'code', 'a.txt'));
});

test('rerun fails on out-of-tolerance or missing values', async () => {
  const cli = fakeCli({ pulled: { 'a.txt': 'A\n', 'b.txt': 'B\n' }, summary: { metrics: { err: 1.2 } } });
  const res = await rerun({ postDir: twoOutputPost(), mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals: new EventEmitter(), ...quiet });
  assert.equal(res.ok, false);
  assert.deepEqual(res.comparison.values.map((v) => v.ok), [false, false]);
  assert.equal(res.comparison.values[1].got, undefined);
});

test('rerun all-match is ok', async () => {
  const cli = fakeCli({ pulled: { 'a.txt': 'A\n', 'b.txt': 'B\n' }, summary: { metrics: { err: 0.97 }, name: 'x' } });
  const res = await rerun({ postDir: twoOutputPost(), mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, signals: new EventEmitter(), ...quiet });
  assert.equal(res.ok, true);
});

test('dry-run calls no delta-cli', async () => {
  const cli = fakeCli();
  const logs = [];
  const res = await rerun({ postDir: FIX, mode: 'dry-run', outDir: '/tmp/x', cli, log: (m) => logs.push(m), warn: () => {} });
  assert.equal(cli.calls.length, 0);
  assert.equal(res.ok, true);
  const text = logs.join('\n');
  assert.match(text, /delta-cli sandbox create --image-name 'Python 3\.11 \(CPU\)' --cpu 1 --memory 2Gi --gpu 0 --max-life 10 --shared-workspace=false/);
  assert.match(text, /delta-cli sandbox run-bg <sandbox_id> --command 'cd <wd> && python add\.py' --timeout 60 --wait/);
  assert.match(text, /delta-cli sandbox kill <sandbox_id>/);
});

test('spec errors and missing local files are usage errors (exit 2), before any delta-cli call', async () => {
  const d = copyHello();
  fs.rmSync(path.join(d, 'add.py'));
  const cli = fakeCli();
  await assert.rejects(rerun({ postDir: d, mode: 'rerun', outDir: path.join(tmp(), 'o'), cli, ...quiet }), (e) => e.exitCode === 2 && /add\.py/.test(e.message));
  fs.writeFileSync(path.join(d, 'delta.yaml'), 'version: 2\n');
  await assert.rejects(rerun({ postDir: d, mode: 'dry-run', cli, ...quiet }), (e) => e.exitCode === 2 && /version/.test(e.message));
  assert.equal(cli.calls.length, 0);
});

test('resolvePostDir maps <user>/<slug> into the package posts folder', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  assert.equal(resolvePostDir('alice/hello', { cwd: '/nonexistent' }), path.join(root, 'posts', 'alice', 'hello'));
  assert.equal(resolvePostDir('test/fixtures/posts/alice/hello', { cwd: root }), path.join(root, 'test/fixtures/posts/alice/hello'));
  assert.equal(resolvePostDir('./alice/hello', { cwd: '/x' }), '/x/alice/hello');
});

test('parseOutput reads envelopes, SSE complete frames and typed errors', () => {
  assert.deepEqual(parseOutput('{"ok":true,"data":{"sandbox_id":"s"}}\n', 0).json, { ok: true, data: { sandbox_id: 's' } });
  const sse = 'data: {"type":"init","execution_id":"e"}\n\ndata: {"type":"stdout","data":"hi"}\n\ndata: {"type":"complete","exit_code":0,"execution_id":"e","result_summary":{"a":1}}\n\n';
  assert.deepEqual(parseOutput(sse, 0).json, { type: 'complete', exit_code: 0, execution_id: 'e', result_summary: { a: 1 } });
  assert.equal(parseOutput('delta-cli version v1.1.17\n', 0).json, null);
  const failed = sse.replace('"exit_code":0', '"exit_code":2') + '{"ok":false,"error":{"type":"command_failed","message":"exit 2"}}\n';
  assert.throws(() => parseOutput(failed, 8), (e) => e instanceof DeltaError && e.type === 'command_failed' && e.frame.exit_code === 2);
  assert.throws(() => parseOutput('{\n  "ok": false,\n  "error": { "type": "auth", "message": "no token" }\n}\n', 3), (e) => e.type === 'auth' && /no token/.test(e.message));
  assert.throws(() => parseOutput('data: {"type":"stdout","data":"x"}\n{"ok":true,"data":{"finished":false,"running":true}}\n', 0), (e) => e.type === 'timeout');
  assert.throws(() => parseOutput('garbage', 1, 'stderr says no'), (e) => e.type === 'internal' && /stderr says no/.test(e.message));
});

test('deltaCli spawns with an argv array (no shell) and parses the envelope', async () => {
  const tricky = '$(echo pwned) `id` ; | && "q"';
  const script = 'console.log(JSON.stringify({ ok: true, data: { argv: process.argv.slice(1) } }))';
  const { json } = await deltaCli(['-e', script, tricky], { bin: process.execPath });
  assert.deepEqual(json.data.argv, [tricky]);
  await assert.rejects(deltaCli(['-e', 'console.log(JSON.stringify({ok:false,error:{type:"not_found",message:"no sandbox"}})); process.exit(4)'], { bin: process.execPath }), (e) => e.type === 'not_found');
  await assert.rejects(deltaCli([], { bin: 'definitely-not-delta-cli-xyz' }), (e) => e.type === 'not_installed');
});

test('vibe-rerun exit codes: 0 match, 1 mismatch, 2 usage, 130 interrupted', async () => {
  const deps = { signals: new EventEmitter(), ...quiet };
  assert.equal(await runCli([FIX, '--dry-run'], deps), 0);
  assert.equal(await runCli([], deps), 2);
  assert.equal(await runCli([FIX, '--bogus'], deps), 2);
  assert.equal(await runCli([FIX, '--record', '--out', 'x'], deps), 2);
  assert.equal(await runCli([FIX, '--out', path.join(tmp(), 'o')], { ...deps, cli: fakeCli() }), 0);
  assert.equal(await runCli([FIX, '--out', path.join(tmp(), 'o')], { ...deps, cli: fakeCli({ pulled: { 'result.txt': '4\n' } }) }), 1);
  assert.equal(await runCli([FIX, '--out', path.join(tmp(), 'o')], { ...deps, cli: fakeCli({ throwOn: { create: new DeltaError('auth', 'no token') } }) }), 1);
  const signals = new EventEmitter();
  const cli = fakeCli({ runBg: () => new Promise(() => {}) });
  const p = runCli([FIX, '--out', path.join(tmp(), 'o')], { ...quiet, signals, cli, exit: () => {} });
  while (!cli.subs().includes('run-bg')) await new Promise((r) => setImmediate(r));
  signals.emit('SIGTERM');
  assert.equal(await p, 130);
});
