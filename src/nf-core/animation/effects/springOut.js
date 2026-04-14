// Applies a springy scale-out effect while fading the canvas content away.
export function springOut(ctx, progress, w, h) {
  const spring = 1 - Math.cos(progress * Math.PI * 4) * Math.exp(-6 * progress);
  const scale = 1 - spring * 0.5;
  ctx.globalAlpha = 1 - progress;
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
}
