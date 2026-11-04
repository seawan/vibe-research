// Interactive figures: a post line "@interactive widgets.js#odds data=probes.json:odds "Caption"" becomes a figure
// holding a sandboxed iframe. The author's script runs with an opaque origin and no network; the only data it sees
// is what the build copies in from files listed in the post's outputs. There is no separately served HTML file,
// so the script can never run outside the sandbox.
import fs from 'node:fs';
import path from 'node:path';

const LINE = /^@interactive[ \t]+(\S+?\.js)#([\w-]+)((?:[ \t]+[a-z]+=\S+)*)[ \t]+"(.*)"[ \t]*$/gm;
const SANE_NAME = /^(?!\/)(?!.*\.\.)[\w./-]+$/;
export const MAX_DATA_BYTES = 200_000;

// "a,b\n1,x" -> [{ a: 1, b: 'x' }]
export function parseCsv(text) {
  const [head, ...rows] = String(text).trim().split(/\r?\n/).map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] !== '' && !isNaN(r[i]) ? Number(r[i]) : r[i]])));
}

// "probes.json:odds:alphabet,results.csv" -> { "probes.json": { odds, alphabet }, "results.csv": [...] }
function loadData(spec, dir, outputs, problem) {
  const data = {};
  for (const item of spec ? spec.split(',') : []) {
    const [file, ...keys] = item.split(':');
    if (!SANE_NAME.test(file)) { problem(`data file "${file}" is not a plain path inside the post`); continue; }
    if (!outputs.includes(path.posix.normalize(file))) problem(`data file "${file}" is not listed in outputs`);
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) { problem(`data file "${file}" not found`); continue; }
    const text = fs.readFileSync(p, 'utf8');
    let value;
    try { value = file.endsWith('.csv') ? parseCsv(text) : JSON.parse(text); } catch (e) { problem(`data file "${file}": ${e.message}`); continue; }
    if (keys.length) {
      const missing = keys.filter((k) => !(k in value));
      if (missing.length) problem(`data file "${file}" has no key ${missing.join(', ')}`);
      value = Object.fromEntries(keys.filter((k) => k in value).map((k) => [k, value[k]]));
    }
    data[file] = value;
  }
  return data;
}

// Base look, the helpers every widget gets, and the height report to the host page.
const KIT_CSS = `:root{color-scheme:light dark;--bg:#fdfcfa;--fg:#1d1d1f;--muted:#6b6b70;--line:#e6e3dd;--panel:#f4f2ee;--accent:#2557a7;--real:#d9631e;--good:#1d7a46;--bad:#b3261e;--goodbg:#d8f0e0;--badbg:#f9dcd9}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--fg:#e6e6e3;--muted:#9a9aa0;--line:#2d2f34;--panel:#1f2125;--accent:#7aa7f0;--real:#f0935a;--good:#5fc48a;--bad:#f08a80;--goodbg:#17392a;--badbg:#45211e}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
#root{padding:14px;border:1px solid var(--line);border-radius:10px;text-align:left}
button{font:inherit;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 12px;min-height:38px;cursor:pointer}
button:hover:not(:disabled){border-color:var(--accent)}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button:disabled{cursor:default;opacity:.65}
button.on{background:var(--accent);border-color:var(--accent);color:var(--bg)}
input[type=range]{width:100%;accent-color:var(--accent);min-height:30px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.ask{font-weight:650;margin:0 0 8px}.muted{color:var(--muted);font-size:14px}.say{margin:8px 0}`;
const KIT_JS = `const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='style')e.style.cssText=v;else if(v!==false&&v!=null)e.setAttribute(k,v===true?'':v);}e.append(...kids.flat().filter((x)=>x!=null));return e;};
const root=document.getElementById('root');
const report=()=>parent.postMessage({type:'vibe-height',height:document.body.offsetHeight},'*');
new ResizeObserver(report).observe(document.body);addEventListener('load',report);
for(const ev of['click','input'])addEventListener(ev,()=>setTimeout(report,30));
addEventListener('error',()=>{root.textContent='This interactive figure could not start.';});`;

export function srcdoc({ code, name, data }) {
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<style>${KIT_CSS}</style></head><body><div id="root"></div>
<script>const VIBE={name:${json(name)},data:${json(data)}};
${KIT_JS}
${code}
</script></body></html>`;
}

// Replace each @interactive line with a block token carrying the finished sandbox document.
export function expandInteractive(md, { dir, outputs, report }) {
  const have = (Array.isArray(outputs) ? outputs : []).filter((o) => typeof o === 'string').map((o) => path.posix.normalize(o));
  return md.replace(LINE, (line, file, name, opts, caption) => {
    const problem = (m) => report(`@interactive ${file}#${name}: ${m}`);
    const options = Object.fromEntries(opts.trim().split(/\s+/).filter(Boolean).map((o) => { const i = o.indexOf('='); return [o.slice(0, i), o.slice(i + 1)]; }));
    const p = path.join(dir, file);
    if (!SANE_NAME.test(file) || !fs.existsSync(p)) { problem('script not found'); return line; }
    const code = fs.readFileSync(p, 'utf8');
    if (/<\/script/i.test(code)) { problem('the script must not contain a closing script tag'); return line; }
    const data = loadData(options.data, dir, have, problem);
    const size = JSON.stringify(data).length;
    if (size > MAX_DATA_BYTES) problem(`data is ${size} bytes; the limit is ${MAX_DATA_BYTES}. Pick fewer keys, like data=file.json:key`);
    const height = Math.min(1600, Math.max(80, parseInt(options.height, 10) || 360));
    return `@@interactive ${encodeURIComponent(JSON.stringify({ doc: srcdoc({ code, name, data }), height, caption }))}\n`;
  });
}
