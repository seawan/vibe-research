// Fits each interactive figure's height to its content. Sandboxed frames can only ask for a height, and it is clamped.
// Lesson games may also keep a small progress note for this page (they have no storage of their own) and ask to be scrolled back into view.
const MAX_SAVE = 4096;
addEventListener('message', (e) => {
  const frames = [...document.querySelectorAll('figure.interactive iframe')];
  const frame = frames.find((f) => f.contentWindow === e.source);
  if (!frame) return;
  const key = `vibe-lesson:${location.pathname}:${frames.indexOf(frame)}`;
  const type = e.data?.type;
  if (type === 'vibe-height') {
    const height = Math.ceil(Number(e.data.height));
    if (height > 0) frame.style.height = `${Math.min(1600, Math.max(80, height))}px`;
  } else if (type === 'vibe-top') {
    if (frame.getBoundingClientRect().top < 0) frame.scrollIntoView({ block: 'start' });
  } else if (type === 'vibe-save' && typeof e.data.value === 'string' && e.data.value.length <= MAX_SAVE) {
    try { localStorage.setItem(key, e.data.value); } catch { /* progress just won't be kept */ }
  } else if (type === 'vibe-load') {
    let value = null;
    try { value = localStorage.getItem(key); } catch { /* same */ }
    if (value) e.source.postMessage({ type: 'vibe-saved', value }, '*');
  }
});
