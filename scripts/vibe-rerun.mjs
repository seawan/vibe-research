#!/usr/bin/env node
// Record or rerun a post's experiment on Delta (see delta.yaml in the post folder).
//   vibe-rerun <user>/<slug> | <postDir> [--record] [--dry-run] [--out <dir>]
// <user>/<slug> resolves to posts/<user>/<slug> inside this package, so `npx github:seawan/vibe-research#<sha>`
// reruns the post exactly as published at that commit.
// Exit codes: 0 everything matches, 1 mismatch or failed run, 2 usage/spec error, 130 interrupted.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rerun, resolvePostDir } from './lib/rerun.mjs';

const USAGE = `usage: vibe-rerun <user>/<slug> | <postDir> [--record] [--dry-run] [--out <dir>]
  (default)   rerun on Delta into --out (default ./rerun-<slug>-<YYYYMMDD-HHMMSS>/) and compare with the published outputs
  --record    author mode: run on Delta, pull outputs into the post folder and write run.json
  --dry-run   validate delta.yaml and local files, print the delta-cli commands, run nothing`;

// Returns the process exit code. `deps` are passed through to rerun() (tests inject cli/signals/exit/log).
export async function runCli(argv, deps = {}) {
  const err = deps.warn ?? console.error;
  let record = false, dryRun = false, outDir, target;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { (deps.log ?? console.log)(USAGE); return 0; }
    else if (a === '--record') record = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--out') { outDir = argv[++i]; if (!outDir) { err(`--out needs a directory\n${USAGE}`); return 2; } }
    else if (a.startsWith('--out=')) outDir = a.slice(6);
    else if (a.startsWith('-')) { err(`unknown option ${a}\n${USAGE}`); return 2; }
    else if (target) { err(`only one post can be given\n${USAGE}`); return 2; }
    else target = a;
  }
  if (!target) { err(USAGE); return 2; }
  if (record && outDir) { err('--out cannot be used with --record (record writes into the post folder)'); return 2; }
  const mode = dryRun ? 'dry-run' : record ? 'record' : 'rerun';
  try {
    const res = await rerun({ ...deps, postDir: resolvePostDir(target), mode, outDir, record });
    return res.interrupted ? 130 : res.ok ? 0 : 1;
  } catch (e) {
    if (e.exitCode === 2) { err(e.message); return 2; }
    err(`vibe-rerun: ${e.type ? `[${e.type}] ` : ''}${e.message}${e.hint ? `\nhint: ${e.hint}` : ''}`);
    return 1;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await runCli(process.argv.slice(2)));
