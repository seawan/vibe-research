// Thin wrapper around the delta-cli binary: argv in (never a shell), parsed JSON out.
// Envelopes look like {"ok":true,"data":{...}} / {"ok":false,"error":{"type","message"}};
// `run` and `run-bg --wait` stream SSE frames `data: {...}` and end with a `complete` frame.
import { spawn } from 'node:child_process';

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
  if (complete) return { json: complete, stdout };
  const ok = envelopes.findLast((e) => e?.ok === true);
  if (ok) return { json: ok, stdout };
  if (code !== 0) throw new DeltaError('internal', `delta-cli exited with code ${code}: ${tail(stderr || stdout) || '(no output)'}`);
  return { json: null, stdout };
}

// echo: stream the sandbox command's stdout/stderr frames (and delta-cli's stderr) to our stderr.
export function deltaCli(args, { echo = false, bin = 'delta-cli', spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnImpl(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (err) { return reject(err); }
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
          const text = [f.data, f.content, f.text, f.line].find((v) => typeof v === 'string');
          if ((f.type === 'stdout' || f.type === 'stderr') && text) process.stderr.write(text.endsWith('\n') ? text : text + '\n');
        } catch { /* ignore */ }
      }
    });
    child.stderr.on('data', (chunk) => { err += chunk; if (echo) process.stderr.write(chunk); });
    child.on('error', (e) => reject(e.code === 'ENOENT'
      ? new DeltaError('not_installed', `${bin} not found on PATH; install it and configure auth (https://github.com/yzailab/delta-infra-cli)`)
      : e));
    child.on('close', (code) => {
      try { resolve(parseOutput(out, code ?? 1, err)); } catch (e) { reject(e); }
    });
  });
}
