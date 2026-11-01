// Filters and client-side search for the post lists. No libraries; search.json text is only compared, never inserted as HTML.
(() => {
  const bar = document.querySelector('.filters');
  if (!bar) return;
  const cards = [...document.querySelectorAll('.post-item[data-id]')];
  const box = bar.querySelector('.search-box');
  const chips = [...bar.querySelectorAll('[data-ai-filter]')];
  const badgeOnly = bar.querySelector('.badge-only');
  const none = bar.querySelector('.no-results');
  let index = null, loading = null;

  const hay = (e) => [e.title, e.subtitle, e.summary, ...(e.tags ?? []), ...(e.authors ?? []), ...(e.ai ?? [])].join('\n').toLowerCase();
  function load() {
    loading ??= fetch(bar.dataset.searchUrl).then((r) => r.json()).then((j) => { index = new Map(j.map((e) => [e.id, hay(e)])); apply(); }).catch(() => { loading = null; });
    return loading;
  }
  function apply() {
    const sel = chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.aiFilter);
    const q = box.value.trim().toLowerCase();
    let shown = 0;
    for (const c of cards) {
      const ai = (c.dataset.ai || '').split(' ');
      let ok = (!sel.length || sel.some((s) => ai.includes(s))) && (!badgeOnly.checked || c.dataset.badge === '1');
      if (ok && q && index) ok = (index.get(c.dataset.id) ?? '').includes(q);
      c.hidden = !ok;
      if (ok) shown++;
    }
    none.hidden = shown > 0 || cards.length === 0;
  }
  chips.forEach((c) => c.addEventListener('click', () => { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); apply(); }));
  badgeOnly.addEventListener('change', apply);
  box.addEventListener('focus', load);
  box.addEventListener('input', () => { load(); apply(); });
})();
