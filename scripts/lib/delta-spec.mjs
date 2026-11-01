// delta.yaml validation, figure provenance and the Delta-reproducible badge rule.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { marked } from 'marked';

const INTERPRETERS = ['python', 'python3', 'node', 'bash', 'sh', 'Rscript', 'julia'];
const SIZE_RE = /^(\d+)(Gi|Mi)$/;
const toMi = (s) => { const m = SIZE_RE.exec(s); return +m[1] * (m[2] === 'Gi' ? 1024 : 1); };
const isInt = (n, min, max = Infinity) => Number.isInteger(n) && n >= min && n <= max;
const isStr = (s) => typeof s === 'string' && s.trim() !== '';
// relative, inside the post folder
const badPath = (p) => !isStr(p) || path.posix.isAbsolute(p) || path.win32.isAbsolute(p) || /^[a-z]:/i.test(p) || p.split(/[\\/]/).includes('..');
const normPath = (p) => path.posix.normalize(String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, ''));

export function parseDeltaSpec(text) {
  const errors = [];
  let spec;
  try { spec = yaml.load(text); } catch (err) { return { spec: null, errors: [`delta.yaml: invalid YAML (${err.reason ?? err.message})`] }; }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { spec: null, errors: ['delta.yaml: must be a YAML mapping'] };
  const err = (m) => errors.push(`delta.yaml: ${m}`);

  if (spec.version !== 1) err('version: must be 1');
  if (!['domestic', 'overseas'].includes(spec.deployment)) err('deployment: must be "domestic" or "overseas"');
  const s = spec.sandbox;
  if (!s || typeof s !== 'object' || Array.isArray(s)) err('sandbox: required mapping');
  else {
    if (!isStr(s.image)) err('sandbox.image: must be a non-empty string');
    if (!isInt(s.cpu, 1)) err('sandbox.cpu: must be an integer >= 1');
    if (typeof s.memory !== 'string' || !SIZE_RE.test(s.memory)) err('sandbox.memory: must look like 16Gi or 512Mi');
    if (!isInt(s.gpu, 0)) err('sandbox.gpu: must be an integer >= 0');
    else if (s.gpu > 0 && !isInt(s.gpu_mem, 1)) err('sandbox.gpu_mem: required (integer MiB per GPU) when gpu > 0');
    if (s.gpu_mem !== undefined && !isInt(s.gpu_mem, 1)) err('sandbox.gpu_mem: must be a positive integer');
    if (s.gpu_type !== undefined && !isStr(s.gpu_type)) err('sandbox.gpu_type: must be a non-empty string');
    if (s.shm_size !== undefined) {
      if (typeof s.shm_size !== 'string' || !SIZE_RE.test(s.shm_size)) err('sandbox.shm_size: must look like 4Gi or 512Mi');
      else if (typeof s.memory === 'string' && SIZE_RE.test(s.memory) && toMi(s.shm_size) > toMi(s.memory)) err('sandbox.shm_size: must not exceed sandbox.memory');
    }
    if (!isInt(s.max_life, 1, 1440)) err('sandbox.max_life: must be an integer from 1 to 1440 (minutes)');
  }
  const upload = spec.upload ?? '.';
  if (badPath(upload)) err('upload: must be a relative directory inside the post folder (no absolute path, no "..")');
  if (spec.setup !== undefined && !isStr(spec.setup)) err('setup: must be a non-empty string');
  if (!isStr(spec.command)) err('command: must be a non-empty string');
  if (!isInt(spec.timeout, 1, 86400)) err('timeout: must be an integer from 1 to 86400 (seconds)');
  if (!Array.isArray(spec.outputs) || spec.outputs.length === 0) err('outputs: must be a non-empty list of file paths');
  else for (const o of spec.outputs) if (badPath(o)) err(`outputs: "${o}" must be a relative path with no ".." segment`);
  if (spec.expected !== undefined && (!spec.expected || typeof spec.expected !== 'object' || Array.isArray(spec.expected))) err('expected: must be a mapping');

  return { spec: { ...spec, upload }, errors };
}

// Images in the markdown as marked sees them (so reference-style, <angle> paths, either quote style and code spans/blocks all behave).
// `{diagram}` at the end of the title marks a hand-made diagram.
export function figuresIn(markdown) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'image') {
      let href = node.href ?? '';
      try { href = decodeURI(href); } catch { /* keep as is */ }
      out.push({ path: normPath(href), diagram: /\{diagram\}\s*$/.test(node.title ?? '') });
      return;
    }
    for (const k of ['tokens', 'items', 'header', 'rows']) walk(node[k]);
  };
  walk(marked.lexer(String(markdown)));
  return out;
}

export const stripDiagram = (title) => String(title ?? '').replace(/\s*\{diagram\}\s*$/, '');

// outputs are relative to the upload dir (the sandbox working directory); figure paths are relative to the post dir
export function checkFigures({ figures = [], outputs = [], upload = '.' }) {
  const have = new Set((Array.isArray(outputs) ? outputs : []).filter((o) => typeof o === 'string').map((o) => normPath(path.posix.join(normPath(upload), normPath(o)))));
  return figures.filter((f) => !f.diagram && !have.has(f.path)).map((f) => `figure "${f.path}" is not listed in outputs and not marked {diagram}`);
}

// first non-flag token after an interpreter is the script (relative to upload); python -m / -c have none
export function commandScript(command) {
  const tokens = String(command ?? '').trim().split(/\s+/);
  if (!INTERPRETERS.includes(path.posix.basename(tokens[0]))) return undefined;
  const rest = tokens.slice(1);
  return rest.some((t) => t === '-m' || t === '-c') ? undefined : rest.find((t) => !t.startsWith('-'));
}

export function computeBadge({ postDir, spec, run, figures = [] }) {
  const reasons = [];
  if (!spec) return { badge: false, reasons: ['delta.yaml is missing or invalid'] };
  const up = spec.upload ?? '.';
  // must exist and, after resolving symlinks, stay inside the post folder
  const root = fs.realpathSync(postDir);
  const real = (rel) => { try { const r = fs.realpathSync(path.join(postDir, rel)); return r === root || r.startsWith(root + path.sep) ? r : null; } catch { return null; } };
  const exists = (rel) => real(rel) !== null;
  const inUp = (p) => path.join(up, p);
  if (!run) reasons.push('run.json is missing (the Specs section needs a real run)');
  else if (run.exit_code !== 0) reasons.push(`run.json: exit_code is ${run.exit_code}, expected 0`);
  const upReal = real(up);
  if (!upReal || !fs.statSync(upReal).isDirectory()) reasons.push(`upload directory "${up}" does not exist`);
  const script = commandScript(spec.command);
  if (script && !exists(inUp(script))) reasons.push(`command script "${script}" does not exist`);
  for (const o of spec.outputs ?? []) if (!exists(inUp(o))) reasons.push(`output file "${o}" does not exist`);
  reasons.push(...checkFigures({ figures, outputs: spec.outputs, upload: up }));
  return { badge: reasons.length === 0, reasons };
}
