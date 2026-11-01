// Readable HTML views of the files shipped with a post: source code, CSV tables and Jupyter notebooks.
import hljs from 'highlight.js';
import { esc } from './lib/sections.mjs';

export const CODE_LANGS = {
  '.py': 'python', '.js': 'javascript', '.mjs': 'javascript', '.ts': 'typescript', '.sh': 'bash',
  '.r': 'r', '.jl': 'julia', '.m': 'matlab', '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cu': 'cpp',
  '.rs': 'rust', '.go': 'go', '.java': 'java', '.lean': 'plaintext', '.tex': 'latex', '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'ini', '.sql': 'sql', '.txt': 'plaintext', '.log': 'plaintext',
};
const LANG_NAMES = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', bash: 'Shell', r: 'R', julia: 'Julia', matlab: 'MATLAB', c: 'C', cpp: 'C++', rust: 'Rust', go: 'Go', java: 'Java', latex: 'LaTeX', json: 'JSON', yaml: 'YAML', ini: 'TOML', sql: 'SQL', plaintext: 'Text' };
const MAX_BYTES = 2_000_000;

/** Which viewer (if any) a file gets: 'code' | 'csv' | 'notebook' | null. */
export function viewerKind(name, size) {
  if (size > MAX_BYTES) return null;
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (ext === '.ipynb') return 'notebook';
  if (ext === '.csv' || ext === '.tsv') return 'csv';
  return CODE_LANGS[ext] ? 'code' : null;
}

export function langOf(name) {
  return CODE_LANGS[name.slice(name.lastIndexOf('.')).toLowerCase()] ?? 'plaintext';
}

export function highlight(code, lang) {
  return hljs.highlight(code, { language: hljs.getLanguage(lang) ? lang : 'plaintext' }).value;
}

// hljs spans can cross line breaks (docstrings, multi-line strings); close and reopen them per line
function splitLines(html) {
  const lines = [];
  let open = [];
  for (const raw of html.split('\n')) {
    const prefix = open.join('');
    for (const m of raw.matchAll(/<span[^>]*>|<\/span>/g)) m[0] === '</span>' ? open.pop() : open.push(m[0]);
    lines.push(prefix + raw + '</span>'.repeat(open.length));
  }
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** Source file -> { html, summary } with numbered, linkable lines (#L12, #L12-L20). */
export function renderCode(text, lang) {
  const lines = splitLines(highlight(text, lang));
  const rows = lines.map((l, i) => `<tr id="L${i + 1}"><td class="ln"><a href="#L${i + 1}">${i + 1}</a></td><td class="lc"><code>${l || ' '}</code></td></tr>`).join('\n');
  return {
    html: `<div class="code-view hljs"><table class="code-lines"><tbody>\n${rows}\n</tbody></table></div>`,
    summary: `${LANG_NAMES[lang] ?? lang} · ${lines.length} lines`,
  };
}

function parseDelimited(text, sep) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** CSV/TSV -> sortable-looking table with numeric columns right-aligned. */
export function renderCsv(text, name) {
  const [header = [], ...body] = parseDelimited(text, name.toLowerCase().endsWith('.tsv') ? '\t' : ',');
  const LIMIT = 2000;
  const numeric = header.map((_, j) => body.length > 0 && body.every((r) => r[j] === undefined || r[j] === '' || !isNaN(Number(r[j]))));
  const td = (v, j) => `<td${numeric[j] ? ' class="num"' : ''}>${esc(v)}</td>`;
  const rows = body.slice(0, LIMIT).map((r) => `<tr>${r.map(td).join('')}</tr>`).join('\n');
  const more = body.length > LIMIT ? `<p class="meta">Showing the first ${LIMIT} of ${body.length} rows. Download the raw file for the rest.</p>` : '';
  return {
    html: `<div class="table-wrap"><table class="data-table"><thead><tr>${header.map((h, j) => `<th${numeric[j] ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>\n${rows}\n</tbody></table></div>${more}`,
    summary: `Table · ${body.length} rows × ${header.length} columns`,
  };
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const joinSrc = (s) => (Array.isArray(s) ? s.join('') : s ?? '');

function renderOutput(o) {
  if (o.output_type === 'stream') return `<pre class="nb-out${o.name === 'stderr' ? ' nb-stderr' : ''}">${esc(stripAnsi(joinSrc(o.text)))}</pre>`;
  if (o.output_type === 'error') return `<pre class="nb-out nb-err">${esc(stripAnsi((o.traceback ?? []).join('\n')))}</pre>`;
  const d = o.data ?? {};
  // notebook outputs are untrusted: images only as validated base64 data URLs, SVG only via <img>, HTML never inlined
  const img = (type, b64) => (/^[A-Za-z0-9+/=]*$/.test(b64) ? `<div class="nb-img"><img src="data:${type};base64,${b64}" alt="cell output"></div>` : '<p class="meta">[image omitted]</p>');
  if (d['image/png']) return img('image/png', joinSrc(d['image/png']).replace(/\s/g, ''));
  if (d['image/jpeg']) return img('image/jpeg', joinSrc(d['image/jpeg']).replace(/\s/g, ''));
  if (d['image/svg+xml']) return `<div class="nb-img"><img src="data:image/svg+xml;base64,${Buffer.from(joinSrc(d['image/svg+xml'])).toString('base64')}" alt="SVG output"></div>`;
  if (d['text/html'] && !d['text/plain']) return `<pre class="nb-out">${esc(joinSrc(d['text/html']))}</pre>`;
  if (d['text/plain']) return `<pre class="nb-out">${esc(stripAnsi(joinSrc(d['text/plain'])))}</pre>`;
  return '';
}

/** .ipynb -> markdown cells rendered (with math), code cells highlighted, outputs inline. */
export function renderNotebook(text, mdToHtml) {
  const nb = JSON.parse(text);
  const lang = nb.metadata?.kernelspec?.language ?? nb.metadata?.language_info?.name ?? 'python';
  let nCode = 0;
  const cells = (nb.cells ?? []).map((c) => {
    const src = joinSrc(c.source);
    if (c.cell_type === 'markdown') return `<div class="nb-md">${mdToHtml(src)}</div>`;
    if (c.cell_type !== 'code') return '';
    nCode++;
    const outputs = (c.outputs ?? []).map(renderOutput).join('');
    return `<div class="nb-cell"><div class="nb-prompt">In [${Number.isInteger(c.execution_count) ? c.execution_count : ' '}]</div><pre class="nb-src"><code class="hljs">${highlight(src, lang)}</code></pre>${outputs ? `<div class="nb-outputs">${outputs}</div>` : ''}</div>`;
  }).join('\n');
  return { html: `<div class="notebook">${cells}</div>`, summary: `Jupyter notebook · ${nCode} code cells` };
}
