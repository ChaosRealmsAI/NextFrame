// Applies a scale-out transition by shrinking and fading the canvas content.
export function scaleOut(ctx, progress, w, h) {
  const s = 1 - progress;
  ctx.globalAlpha = 1 - progress;
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  ctx.translate(-w / 2, -h / 2);
}
