// Thin wrapper around the delta-cli binary: argv in (never a shell), parsed JSON out.
// Envelopes look like {"ok":true,"data":{...}} / {"ok":false,"error":{"type","message"}};
// `run` and `run-bg --wait` stream SSE frames `data: {...}` and end with a `complete` frame.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class DeltaError extends Error {
  constructor(type, message, { frame, hint } = {}) {
    super(message);
    this.name = 'DeltaError';
    this.type = type;
    if (frame) this.frame = frame;
    if (hint) this.hint = hint;
  }
}

// Every top-level JSON object in `text` (envelopes may be pretty-printed over several lines).
function jsonObjects(text) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"' && depth > 0) inStr = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && depth > 0 && --depth === 0) {
      try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* not JSON, skip */ }
    }
  }
  return out;
}

const tail = (s, n = 400) => (s.length > n ? '…' + s.slice(-n) : s).trim();

// Parse one finished delta-cli invocation. Returns { json, stdout }; json is the `complete` frame for
// SSE output, the envelope otherwise, or null for plain text (e.g. --version). Throws DeltaError.
const frameText = (f) => [f?.data, f?.content, f?.text, f?.line].find((v) => typeof v === 'string');

export function parseOutput(stdout, code, stderr = '') {
  const frames = [];
  const rest = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^data:\s?(.*)$/.exec(line);
    if (!m) { rest.push(line); continue; }
    try { frames.push(JSON.parse(m[1])); } catch { /* partial or non-JSON frame */ }
  }
  const envelopes = jsonObjects(rest.join('\n'));
  const complete = frames.findLast((f) => f?.type === 'complete');
  const failed = envelopes.find((e) => e?.ok === false);
  const init = frames.find((f) => f?.type === 'init' && f.execution_id);
  // newer delta-cli reports a dropped live stream as a network error; the command itself is still running
  if (failed && !complete && init && failed.error?.type === 'network') return { json: { type: 'incomplete', execution_id: init.execution_id }, stdout };
  if (failed) {
    const e = failed.error ?? {};
    throw new DeltaError(e.type ?? 'internal', e.message ?? 'delta-cli reported an error', { frame: complete, hint: e.hint });
  }
  if (!complete) {
    const snap = envelopes.find((e) => e?.data?.finished === false || e?.finished === false);
    if (snap) throw new DeltaError('timeout', 'command did not finish within --timeout (it may still be running)', { frame: snap.data ?? snap });
    const errFrame = frames.findLast((f) => f?.type === 'error');
    if (errFrame) throw new DeltaError('stream_error', errFrame.message ?? errFrame.error ?? 'stream error');
  }
  if (complete) {
    // delta-cli joins streamed stdout lines without newlines; rebuild it from the per-line frames
    const lines = frames.filter((f) => f?.type === 'stdout').map(frameText).filter((t) => t !== undefined);
    if (lines.length) complete.stdout = lines.map((t) => (t.endsWith('\n') ? t : `${t}\n`)).join('');
    return { json: complete, stdout };
  }
  // stream ended without a complete frame: hand back the execution id so the caller can poll for the result
  if (init && frames.length) return { json: { type: 'incomplete', execution_id: init.execution_id }, stdout };
  const ok = envelopes.findLast((e) => e?.ok === true);
  if (ok) return { json: ok, stdout };
  if (code !== 0) throw new DeltaError('internal', `delta-cli exited with code ${code}: ${tail(stderr || stdout) || '(no output)'}`);
  return { json: null, stdout };
}

// Children run in their own process group (detached) so a terminal Ctrl-C reaches only node, which then
// waits for an in-flight `create` to return its id and kills the sandbox. They are always awaited; any still
// running when node exits (e.g. a forced second Ctrl-C) get SIGTERM so none outlives us.
const live = new Set();
let exitHook = false;
function track(child) {
  live.add(child);
  child.on('close', () => live.delete(child));
  if (!exitHook) {
    exitHook = true;
    process.on('exit', () => { for (const c of live) { try { process.kill(-c.pid, 'SIGTERM'); } catch { try { c.kill('SIGTERM'); } catch { /* gone */ } } } });
  }
}

// What to spawn for delta-cli, as { command, prefix } (prefix args go before the caller's args); never a shell.
// DELTA_CLI overrides the lookup: a .js/.mjs/.cjs path runs under this node, anything else is spawned as is.
// On Windows npm installs delta-cli as a .cmd/.ps1 shim that spawn cannot run without a shell, so the shim is
// resolved to node + the package's scripts/run.js next to it (preferring a node.exe there, as the shim does).
export function resolveDeltaBin({ env = process.env, platform = process.platform, execPath = process.execPath, exists = fs.existsSync } = {}) {
  const override = env.DELTA_CLI?.trim();
  if (override) return /\.[cm]?js$/i.test(override) ? { command: execPath, prefix: [override] } : { command: override, prefix: [] };
  if (platform !== 'win32') return { command: 'delta-cli', prefix: [] };
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  for (const dir of (env[pathKey ?? 'PATH'] ?? '').split(';').map((d) => d.replace(/^"|"$/g, '')).filter(Boolean)) {
    if (exists(path.win32.join(dir, 'delta-cli.exe'))) return { command: path.win32.join(dir, 'delta-cli.exe'), prefix: [] };
    if (!exists(path.win32.join(dir, 'delta-cli.cmd'))) continue;
    const runJs = path.win32.join(dir, 'node_modules', '@delta-infra', 'cli', 'scripts', 'run.js');
    if (!exists(runJs)) continue;
    const localNode = path.win32.join(dir, 'node.exe');
    return { command: exists(localNode) ? localNode : execPath, prefix: [runJs] };
  }
  return { command: 'delta-cli', prefix: [] };
}

// echo(text): receives the sandbox command's stdout/stderr frames and delta-cli's own stderr as they arrive.
// bin, when given, is spawned directly; otherwise resolveDeltaBin() picks it (DELTA_CLI, Windows npm shim).
export function deltaCli(args, { echo = null, bin, spawnImpl = spawn, resolveBin = resolveDeltaBin } = {}) {
  const { command, prefix } = bin ? { command: bin, prefix: [] } : resolveBin();
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnImpl(command, [...prefix, ...args], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, windowsHide: true }); } catch (err) { return reject(err); }
    if (child.pid) track(child);
    let out = '', err = '', pending = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (!echo) return;
      const lines = (pending + chunk).split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const m = /^data:\s?(.*)$/.exec(line);
        if (!m) continue;
        try {
          const f = JSON.parse(m[1]);
          const text = frameText(f);
          if ((f.type === 'stdout' || f.type === 'stderr') && text) echo(text);
        } catch { /* ignore */ }
      }
    });
    child.stderr.on('data', (chunk) => { err += chunk; if (echo) echo(chunk); });
    child.on('error', (e) => reject(e.code === 'ENOENT'
      ? new DeltaError('not_installed', `${command} not found on PATH; install it and configure auth (https://github.com/yzailab/delta-infra-cli), or set DELTA_CLI to its path`)
      : e));
    child.on('close', (code) => {
      try { resolve(parseOutput(out, code ?? 1, err)); } catch (e) { reject(e); }
    });
  });
}
