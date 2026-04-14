// Applies a springy scale-in effect while fading the canvas content into view.
export function springIn(ctx, progress, w, h) {
  const spring = 1 - Math.cos(progress * Math.PI * 4) * Math.exp(-6 * progress);
  const scale = 0.5 + spring * 0.5;
  ctx.globalAlpha = progress;
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
}
