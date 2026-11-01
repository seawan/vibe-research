// Generated post sections (AI & process, Specs, Author verification, Reproduce), byline, macros. Pure except postCommit.
import { execFileSync } from 'node:child_process';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// only http(s), mailto, relative and #fragment URLs are allowed in rendered links and images
export const safeUrl = (href) => {
  // browsers decode entities inside href attributes, so check the decoded form
  const dec = String(href ?? '').replace(/&#x([\da-f]+);?/gi, (m, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff))).replace(/&#(\d+);?/g, (m, n) => String.fromCodePoint(Math.min(+n, 0x10ffff))).replace(/&colon;/gi, ':').replace(/&(tab|newline);/gi, '');
  const h = dec.replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, '');
  const scheme = /^([^/?#]*?):/.exec(h);
  return !scheme || /^(https?|mailto)$/i.test(scheme[1]);
};
const day = (d) => (d instanceof Date ? (isNaN(d) ? '' : d.toISOString().slice(0, 10)) : String(d ?? '').slice(0, 10));
const h2 = (id, html) => `<h2 id="${id}"><a class="anchor" href="#${id}">#</a>${html}</h2>`;

export function aiProcessBox(fm = {}, chatFiles = []) {
  const rows = (fm.ai ?? []).map((a) => `<li><strong>${esc(a.name)}</strong> <code>${esc(a.model)}</code> <span class="ai-role">${esc(a.role)}</span></li>`).join('');
  const links = [
    ...chatFiles.map((f) => `<a href="${esc(f)}">${esc(f)}</a>`),
    ...(fm.chat_links ?? []).map((u) => `<a href="${esc(u)}" rel="noopener">${esc(u)}</a>`),
  ];
  return `<aside class="box ai-box"><div class="callout-label">AI &amp; process</div>
<ul class="ai-list">${rows}</ul>
<p class="ai-contribution"><strong>Author contribution.</strong> ${esc(fm.contribution)}</p>
${links.length ? `<p class="ai-chats"><strong>Conversations.</strong> ${links.join(' · ')}</p>` : ''}</aside>`;
}

const fmtDuration = (s) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);
const gpuText = (s = {}) => (s.gpu > 0 ? `${s.gpu} × ${s.gpu_type ?? 'GPU'}${s.gpu_mem ? ` (${s.gpu_mem} MiB each)` : ''}` : 'none');

export function specsSection({ spec, run, fm = {} }) {
  if (!run) {
    return `<section class="box specs">${h2('specs', 'Specs: system &amp; compute (self-reported)')}
<p class="specs-note">No Delta run record for this post: the author describes the setup below.</p>
<p>${esc(fm.specs ?? 'Not provided.')}</p></section>`;
  }
  const s = run.sandbox ?? {};
  const rows = [
    ['Deployment', s.deployment ?? spec?.deployment],
    ['Image', s.image],
    ['CPU', s.cpu],
    ['Memory', s.memory],
    ['GPU', gpuText(s)],
    ['Run time', fmtDuration(run.duration_s)],
    ['Run ID', run.execution_id],
    ['Date', day(run.started_at)],
  ].map(([k, v]) => `<tr><th scope="row">${k}</th><td>${esc(v)}</td></tr>`);
  const pk = run.packages ?? [];
  rows.push(`<tr><th scope="row">Packages</th><td>${pk.length ? `<details><summary>${pk.length} package${pk.length === 1 ? '' : 's'}</summary><p class="pkgs">${pk.map(esc).join(', ')}</p></details>` : 'none recorded'}</td></tr>`);
  return `<section class="box specs">${h2('specs', 'Specs: system &amp; compute')}
<div class="table-wrap"><table class="specs-table"><tbody>${rows.join('')}</tbody></table></div>
<p class="specs-note">Recorded from the actual Delta run, not typed by hand.</p></section>`;
}

export function verificationBox(av = {}) {
  return `<section class="box verification">${h2('author-verification', 'Author verification')}
<p class="verif-by"><span class="verified">✓ Signed</span> by <a href="https://github.com/${esc(av.by)}">@${esc(av.by)}</a> on <time datetime="${esc(day(av.date))}">${esc(day(av.date))}</time></p>
<blockquote class="verif-checked">${esc(av.checked)}</blockquote>
<p class="ref-note">Written by the author, not generated. The build only checks that it is present.</p></section>`;
}

export function reproduceBox({ spec, run, badge, reasons = [], id, commit, repo }) {
  if (!badge) {
    return `<section class="box reproduce">${h2('reproduce', 'Reproduce')}
<p><span class="badge badge-off">Not Delta-reproducible</span></p>
<p>This post does not earn the badge yet:</p><ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>`;
  }
  const s = spec?.sandbox ?? run?.sandbox ?? {};
  const dep = spec?.deployment ?? run?.sandbox?.deployment;
  const summary = [s.cpu != null && `${s.cpu} CPU`, s.memory && `${s.memory} memory`, s.gpu > 0 ? `GPU: ${gpuText(s)}` : s.gpu === 0 && 'no GPU', spec?.sandbox?.max_life && `up to ${spec.sandbox.max_life} min`, dep].filter(Boolean).join(' · ');
  return `<section class="box reproduce">${h2('reproduce', 'Reproduce')}
<p><span class="badge badge-ok">✓ Delta-reproducible</span></p>
<pre><code>npx -y github:${esc(repo)}#${esc(commit)} ${esc(id)}</code></pre>
<p>Pinned to the commit that last changed this post. Rerun spec: <a href="delta.yaml"><code>delta.yaml</code></a>. ${summary ? `Resources: ${esc(summary)}.` : ''}</p>
<p class="ref-note">Need Delta? Register for delta-cli first.</p></section>`;
}

export function bylineHtml(authors = [], rel = '') {
  return `<span class="byline">${authors.map((u) => `<a class="author" href="${esc(rel)}@${esc(u)}/"><img class="avatar" src="https://github.com/${esc(u)}.png?size=64" alt="" width="24" height="24" loading="lazy">@${esc(u)}</a>`).join(' ')}</span>`;
}

export function updatedHtml(date, postDate, repo, id) {
  if (!date || day(date) <= day(postDate)) return '';
  return `<a class="updated" href="https://github.com/${esc(repo)}/commits/main/posts/${esc(id)}">Updated ${esc(day(date))}</a>`;
}

// {{result.a.b}} -> value from run.json result_summary (numbers via String). Fenced code is left alone.
export function resolveResultMacros(markdown, summary) {
  const errors = [];
  const parts = String(markdown).split(/(```[\s\S]*?```)/g);
  const out = parts.map((part, i) => (i % 2 === 1 ? part : part.replace(/\{\{\s*result\.([\w.-]+)\s*\}\}/g, (m, key) => {
    let v = summary;
    for (const k of key.split('.')) v = v && typeof v === 'object' && Object.hasOwn(v, k) ? v[k] : undefined;
    if (v === undefined || v === null || typeof v === 'object') {
      errors.push(`{{result.${key}}}: ${summary ? 'no such scalar key in run.json result_summary' : 'run.json has no result_summary'}`);
      return m;
    }
    return String(v);
  })));
  return { markdown: out.join(''), errors };
}

// sha and date (YYYY-MM-DD) of the last commit touching the post folder; main/null outside git or when untracked
export function postCommit(dir) {
  try {
    const [sha, date] = execFileSync('git', ['log', '-1', '--format=%H%n%cs', '--', '.'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n');
    return sha ? { sha, date: date || null } : { sha: 'main', date: null };
  } catch {
    return { sha: 'main', date: null };
  }
}
