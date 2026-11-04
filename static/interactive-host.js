// Fits each interactive figure's height to its content. Sandboxed frames can only ask for a height, and it is clamped.
addEventListener('message', (e) => {
  if (e.data?.type !== 'vibe-height') return;
  const frame = [...document.querySelectorAll('figure.interactive iframe')].find((f) => f.contentWindow === e.source);
  const height = Math.ceil(Number(e.data.height));
  if (frame && height > 0) frame.style.height = `${Math.min(1600, Math.max(80, height))}px`;
});
