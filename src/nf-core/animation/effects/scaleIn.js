// Applies a scale-in transition by growing and fading the canvas content into place.
export function scaleIn(ctx, progress, w, h) {
  const s = progress;
  ctx.globalAlpha = progress;
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  ctx.translate(-w / 2, -h / 2);
}
