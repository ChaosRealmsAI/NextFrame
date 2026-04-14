// Applies a springy scale-out effect while fading the canvas content away.
export function springOut(ctx, progress, w, h) {
  const inv = 1 - progress;
  const s = 1 + 0.5 * (1 - inv) * Math.sin(inv * Math.PI * 3) * Math.exp(-4 * inv) + inv * 0.5;
  ctx.globalAlpha = Math.min(1, inv * 2);
  ctx.translate(w / 2, h / 2);
  ctx.scale(1 / s, 1 / s);
  ctx.translate(-w / 2, -h / 2);
}
