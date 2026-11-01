// Record (author) or rerun (reader) a post's experiment on Delta, following its delta.yaml.
// One sandbox per call, always killed (finally + SIGINT/SIGTERM/SIGHUP). Paths in `outputs` and the
// command's script are relative to the `upload` dir, which becomes the sandbox working directory.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeltaSpec, commandScript } from './delta-spec.mjs';
import { deltaCli, DeltaError } from './delta-cli.mjs';

export class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; this.exitCode = 2; }
}
class Interrupted extends Error {}

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLUG_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
// first existing symlink on the way from root down to root/rel, or null
function symlinkOnPath(root, rel) {
  let cur = root;
  for (const part of path.normalize(rel).split(path.sep).filter((p) => p && p !== '.')) {
    cur = path.join(cur, part);
    try { if (fs.lstatSync(cur).isSymbolicLink()) return cur; } catch { return null; }
  }
  return null;
}
const sha256 = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; } };

// `<user>/<slug>` -> posts/<user>/<slug> inside this package (pinned by the npx ref); anything else is a path.
export function resolvePostDir(arg, { cwd = process.cwd(), root = PKG_ROOT } = {}) {
  const local = path.resolve(cwd, arg);
  return SLUG_RE.test(arg) && !isDir(local) ? path.join(root, 'posts', arg) : local;
}

const pad2 = (n) => String(n).padStart(2, '0');
export function defaultOutDir(postDir, date, cwd = process.cwd()) {
  const d = date;
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return path.resolve(cwd, `rerun-${path.basename(postDir)}-${stamp}`);
}

// For display only; delta-cli itself is always spawned with an argv array.
const shQuote = (s) => (/^[\w/.:=@%+,-]+$/.test(s) || /^<[a-z_]+>$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
export const formatArgs = (args) => ['delta-cli', ...args].map(shQuote).join(' ');

export function planCommands(spec, { postDir, dest, id = '<sandbox_id>', wd = '<wd>' }) {
  const s = spec.sandbox;
  const opt = (f, v) => (v === undefined || v === null ? [] : [f, String(v)]);
  const inWd = (cmd) => `cd ${shQuote(wd)} && ${cmd}`;
  return {
    create: ['sandbox', 'create', '--image-name', s.image, '--cpu', String(s.cpu), '--memory', s.memory, '--gpu', String(s.gpu),
      ...opt('--gpu-mem', s.gpu_mem), ...opt('--gpu-type', s.gpu_type), ...opt('--shm-size', s.shm_size),
      '--max-life', String(s.max_life), '--shared-workspace=false'],
    workdir: ['sandbox', 'working-directory', id],
    upload: ['sandbox', 'upload', id, '--source', path.join(postDir, spec.upload), '--target', wd],
    setup: spec.setup ? ['sandbox', 'run', id, '--command', inWd(spec.setup), '--timeout', '600'] : null,
    command: ['sandbox', 'run-bg', id, '--command', inWd(spec.command), '--timeout', String(spec.timeout), '--wait'],
    packages: ['sandbox', 'run', id, '--command', 'pip freeze 2>/dev/null || true', '--timeout', '60'],
    pulls: spec.outputs.map((o) => ({ output: o, target: path.join(dest, spec.upload, o), args: ['sandbox', 'pull', id, '--source', path.posix.join(wd, o), '--target', path.join(dest, spec.upload, o)] })),
    kill: ['sandbox', 'kill', id],
  };
}

// Spec + local files; every problem is a UsageError (exit 2) raised before any delta-cli call.
export function loadSpec(postDir, { needPublished }) {
  const specPath = path.join(postDir, 'delta.yaml');
  if (!isFile(specPath)) throw new UsageError(`${postDir}: no delta.yaml (is this a post folder?)`);
  const { spec, errors } = parseDeltaSpec(fs.readFileSync(specPath, 'utf8'));
  if (errors.length) throw new UsageError(errors.join('\n'));
  const problems = [];
  const ex = spec.expected;
  if (ex) {
    if (ex.rel_tolerance !== undefined && !(typeof ex.rel_tolerance === 'number' && ex.rel_tolerance >= 0)) problems.push('delta.yaml: expected.rel_tolerance must be a number >= 0');
    if (ex.values !== undefined && (!ex.values || typeof ex.values !== 'object' || Array.isArray(ex.values))) problems.push('delta.yaml: expected.values must be a mapping');
  }
  const root = fs.realpathSync(postDir);
  const upDir = path.join(postDir, spec.upload);
  let upReal = null;
  try { upReal = fs.realpathSync(upDir); } catch { /* missing */ }
  if (!upReal || !isDir(upReal)) problems.push(`upload directory "${spec.upload}" does not exist`);
  else if (upReal !== root && !upReal.startsWith(root + path.sep)) problems.push(`upload directory "${spec.upload}" resolves outside the post folder`);
  else {
    const script = commandScript(spec.command);
    if (script && !isFile(path.join(upDir, script))) problems.push(`command script "${script}" does not exist in "${spec.upload}"`);
    if (needPublished) for (const o of spec.outputs) if (!isFile(path.join(upDir, o))) problems.push(`published output "${o}" is missing, nothing to compare against`);
  }
  if (problems.length) throw new UsageError(problems.join('\n'));
  return spec;
}

const getPath = (obj, key) => key.split('.').reduce((o, k) => (o !== null && typeof o === 'object' ? o[k] : undefined), obj);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function compareValues(expected, summary) {
  const tol = expected?.rel_tolerance ?? 0;
  return Object.entries(expected?.values ?? {}).map(([key, exp]) => {
    const got = getPath(summary, key);
    const ok = isNum(exp) && isNum(got) ? Math.abs(got - exp) <= tol * Math.abs(exp) : JSON.stringify(got) === JSON.stringify(exp);
    return { key, expected: exp, got, ok };
  });
}

function table(headers, rows) {
  const all = [headers, ...rows].map((r) => r.map((c) => String(c)));
  const w = headers.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd()).join('\n');
}
const show = (v) => (v === undefined ? '(missing)' : JSON.stringify(v));

// Prefer what the create response echoed back, fall back to the spec.
function resources(d = {}, spec) {
  const s = spec.sandbox;
  const num = (v, f) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : f);
  return {
    image: (typeof d.image_name === 'string' && d.image_name) || (typeof d.image === 'string' && d.image) || s.image,
    cpu: num(d.cpu, s.cpu),
    memory: (typeof d.memory === 'string' && d.memory) || s.memory,
    gpu: num(d.gpu, s.gpu),
    gpu_mem: Number(d.gpu_mem) > 0 ? Number(d.gpu_mem) : (s.gpu_mem ?? null),
    gpu_type: (typeof d.gpu_type === 'string' && d.gpu_type) || (s.gpu_type ?? null),
    deployment: spec.deployment,
  };
}

export async function rerun({
  postDir, mode = 'rerun', outDir, cli = deltaCli, now = () => new Date(),
  signals = process, exit = (code) => process.exit(code), log = console.log, warn = console.error, record = false,
} = {}) {
  if (!['rerun', 'record', 'dry-run'].includes(mode)) throw new UsageError(`unknown mode "${mode}"`);
  if (!postDir || !isDir(postDir)) throw new UsageError(`post folder not found: ${postDir}`);
  postDir = path.resolve(postDir);
  const recording = mode === 'record' || (mode === 'dry-run' && record);
  const spec = loadSpec(postDir, { needPublished: !recording });
  const dest = recording ? postDir : path.resolve(outDir ?? defaultOutDir(postDir, now()));
  if (!recording && fs.existsSync(dest) && !isDir(dest)) throw new UsageError(`--out ${dest} is an existing file, not a directory`);
  if (recording) {
    const links = spec.outputs.map((o) => symlinkOnPath(postDir, path.join(spec.upload, o))).filter(Boolean);
    if (links.length) throw new UsageError(`refusing to record through symlinks in the post folder: ${links.join(', ')}`);
  }

  if (mode === 'dry-run') {
    // record mode pulls into a staging dir first and moves outputs into the post only after every pull succeeded
    const p = planCommands(spec, { postDir, dest: recording ? '<staging>' : dest });
    const commands = [p.create, p.workdir, p.upload, p.setup, p.command, p.packages, ...p.pulls.map((x) => x.args), p.kill].filter(Boolean).map(formatArgs);
    log(`delta.yaml OK (${spec.deployment}); would run:`);
    for (const c of commands) log(`  ${c}`);
    if (recording) log(`then move the pulled outputs from <staging> into ${postDir} and write run.json`);
    return { ok: true, run: null, comparison: { files: [], values: [] }, commands };
  }
  if (mode === 'rerun' && fs.existsSync(dest) && fs.readdirSync(dest).length) throw new UsageError(`output folder ${dest} already exists and is not empty`);

  const staging = mode === 'record' ? fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-record-')) : null;
  try {
    return await runOnDelta({ spec, postDir, dest, staging, cli, now, signals, exit, log, warn });
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
  }
}

async function runOnDelta({ spec, postDir, dest, staging, cli, now, signals, exit, log, warn }) {
  // after a signal the terminal may be gone (SIGHUP): a failing write (EIO/EPIPE) must not stop the kill
  let shuttingDown = false;
  const guard = (f) => (m) => { if (!shuttingDown) return f(m); try { f(m); } catch { /* terminal gone */ } };
  log = guard(log); warn = guard(warn);
  const recording = staging !== null;
  const pullDest = staging ?? dest;
  const empty = { files: [], values: [] };
  const versionOut = (await cli(['--version'])).stdout ?? '';
  const delta_cli_version = /v?\d+\.\d+\.\d+\S*/.exec(versionOut)?.[0] ?? (versionOut.trim() || null);
  const echo = (t) => warn(String(t).replace(/\n$/, ''));

  // --- live sandbox section -------------------------------------------------------------
  let id = null, createP = null, killP = null, interrupted = false, signalCount = 0, rejectInterrupt;
  const interruptP = new Promise((_, rej) => { rejectInterrupt = rej; });
  interruptP.catch(() => {});
  const call = (args, opts) => { log(`$ ${formatArgs(args)}`); return Promise.race([cli(args, opts), interruptP]); };
  const step = async (args, opts) => {
    try { const { json } = await call(args, opts); return json?.data ?? json ?? {}; }
    catch (e) { if (e instanceof DeltaError && e.type === 'command_failed' && e.frame) return e.frame; throw e; }
  };
  const killOnce = () => {
    if (!id) return Promise.resolve(true);
    killP ??= (async () => {
      const args = ['sandbox', 'kill', id];
      log(`$ ${formatArgs(args)}`);
      try { await cli(args); log(`sandbox ${id} killed`); return true; }
      catch (e) {
        warn([`!! FAILED TO KILL SANDBOX ${id}: ${e.message}`, '!! It may still be running and using your quota. Kill it manually:', `!!   delta-cli sandbox kill ${id}`].join('\n'));
        return false;
      }
    })();
    return killP;
  };
  const onSignal = (sig) => {
    if (!shuttingDown && signals === process) for (const st of [process.stdout, process.stderr]) st.on('error', () => {});
    shuttingDown = true;
    if (++signalCount > 1) { warn(`${sig} again: exiting now. If the sandbox is still alive: delta-cli sandbox kill ${id ?? '<sandbox_id>'} (or find it with delta-cli sandbox list)`); exit(130); return; }
    interrupted = true;
    warn(`${sig}: stopping and killing sandbox ${id ?? '(waiting for create to return its id)'}…`);
    rejectInterrupt(new Interrupted(sig));
  };
  const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const sig of SIGNALS) signals.on(sig, onSignal);

  let killed = false, error = null, failure = null, created = {}, frame = null, started = null, finished = null, packages = [];
  try {
    const createArgs = planCommands(spec, { postDir, dest: pullDest }).create;
    log(`$ ${formatArgs(createArgs)}`);
    createP = cli(createArgs);
    const c = await Promise.race([createP, interruptP]);
    created = c?.json?.data ?? {};
    id = created.sandbox_id ?? null;
    if (!id) throw new DeltaError('api', 'sandbox create returned no data.sandbox_id');
    log(`sandbox ${id} created`);
    const wd = (await step(['sandbox', 'working-directory', id])).path;
    if (!wd) throw new DeltaError('api', 'sandbox working-directory returned no data.path');
    const plan = planCommands(spec, { postDir, dest: pullDest, id, wd });
    await call(plan.upload);
    if (plan.setup) {
      const r = await step(plan.setup, { echo });
      if (r.exit_code !== 0) { frame = r; failure = `setup exited with code ${r.exit_code}`; }
    }
    if (!failure) {
      started = now();
      frame = await step(plan.command, { echo });
      finished = now();
      if (frame.exit_code !== 0) failure = `command exited with code ${frame.exit_code}`;
    }
    if (!failure) {
      try {
        const r = await step(plan.packages);
        packages = String(r.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      } catch (e) { if (e instanceof Interrupted) throw e; warn(`warning: could not list packages (${e.message})`); }
      for (const p of plan.pulls) {
        fs.mkdirSync(path.dirname(p.target), { recursive: true });
        await call(p.args);
      }
    }
  } catch (e) {
    if (!(e instanceof Interrupted)) error = e;
  } finally {
    // interrupted while create was in flight: wait for its id so the sandbox still gets killed
    if (!id && createP) { try { id = (await createP)?.json?.data?.sandbox_id ?? null; } catch { /* create failed */ } }
    if (createP && !id) {
      warn(['!! sandbox create was started but no sandbox id was obtained; a sandbox may still exist.',
        '!! Check with:  delta-cli sandbox list --status running',
        '!! and kill it: delta-cli sandbox kill <sandbox_id>'].join('\n'));
    }
    killed = await killOnce();
    for (const sig of SIGNALS) signals.off(sig, onSignal);
  }
  if (interrupted) { exit(130); return { ok: false, interrupted: true, run: null, comparison: empty }; }
  if (error) throw error;
  // --- sandbox gone ---------------------------------------------------------------------

  const run = frame && {
    version: 1,
    execution_id: frame.execution_id ?? null,
    sandbox: resources(created, spec),
    started_at: started?.toISOString() ?? null,
    finished_at: finished?.toISOString() ?? null,
    duration_s: started && finished ? Math.round((finished - started) / 1000) : null,
    exit_code: frame.exit_code ?? null,
    delta_cli_version,
    packages,
    result_summary: frame.result_summary ?? null,
  };
  if (failure) {
    warn(`run failed: ${failure}`);
    const t = frame?.stderr && String(frame.stderr).slice(-2000);
    if (t) warn(t);
    if (recording) warn('run.json and published outputs were left unchanged.');
    return { ok: false, run, comparison: empty, error: failure };
  }

  const values = compareValues(spec.expected, run.result_summary);
  const valueTable = (title) => log('\n' + table([title, 'expected', 'got', 'ok'], values.map((v) => [v.key, show(v.expected), show(v.got), v.ok ? 'yes' : 'NO'])));
  if (recording) {
    // every pull succeeded: now move the staged outputs into the post (never through a symlink)
    for (const o of spec.outputs) {
      const link = symlinkOnPath(postDir, path.join(spec.upload, o));
      if (link) throw new Error(`refusing to write through symlink ${link}; staged outputs were discarded`);
    }
    const files = spec.outputs.map((o) => {
      const target = path.join(postDir, spec.upload, o);
      const before = sha256(target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(staging, spec.upload, o), target);
      const after = sha256(target);
      return { path: o, match: before === after, status: before === null ? 'new' : before === after ? 'unchanged' : 'changed' };
    });
    fs.writeFileSync(path.join(postDir, 'run.json'), JSON.stringify(run, null, 2) + '\n');
    log(`\nrecorded run ${run.execution_id} (exit ${run.exit_code}, ${run.duration_s}s) -> ${path.join(postDir, 'run.json')}`);
    log(table(['output', 'status'], files.map((f) => [f.path, f.status])));
    const changed = files.filter((f) => f.status !== 'unchanged');
    if (changed.length) log(`\n${changed.length} published output(s) changed in the post folder: ${changed.map((f) => f.path).join(', ')} (review with git diff)`);
    if (values.length) valueTable('value');
    const bad = values.filter((v) => !v.ok);
    if (bad.length) warn(`!! The recorded run does NOT match delta.yaml expected.values (${bad.map((v) => v.key).join(', ')}).\n!! run.json was written, but fix the code or the expected values before publishing.`);
    return { ok: killed && bad.length === 0, run, comparison: { files, values } };
  }

  fs.writeFileSync(path.join(dest, 'run.json'), JSON.stringify(run, null, 2) + '\n');
  const files = spec.outputs.map((o) => {
    const published = sha256(path.join(postDir, spec.upload, o));
    const got = sha256(path.join(dest, spec.upload, o));
    return { path: o, match: published !== null && published === got, published, got };
  });
  const short = (h) => (h ? h.slice(0, 12) : '(missing)');
  log(`\nrerun ${run.execution_id} (exit ${run.exit_code}, ${run.duration_s}s), outputs in ${dest}`);
  log(table(['output', 'published sha256', 'rerun sha256', 'match'], files.map((f) => [f.path, short(f.published), short(f.got), f.match ? 'yes' : 'NO'])));
  if (values.length) valueTable(`value (rel_tolerance ${spec.expected?.rel_tolerance ?? 0})`);
  const ok = killed && files.every((f) => f.match) && values.every((v) => v.ok);
  log(`\n${ok ? 'MATCH: every output and expected value matches the published post.' : 'MISMATCH: see the table above.'}`);
  return { ok, run, comparison: { files, values } };
}
