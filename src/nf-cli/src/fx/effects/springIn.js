// Applies a springy scale-in effect while fading the canvas content into view.
export function springIn(ctx, progress, w, h) {
  const s = 1 + 0.5 * (1 - progress) * Math.sin(progress * Math.PI * 3) * Math.exp(-4 * progress) + progress * 0.5;
  ctx.globalAlpha = Math.min(1, progress * 2);
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  ctx.translate(-w / 2, -h / 2);
}
