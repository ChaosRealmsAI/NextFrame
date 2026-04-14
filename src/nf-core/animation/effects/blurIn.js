// Applies a decreasing blur while fading the canvas content into view.
export function blurIn(ctx, progress) {
  const blur = 20 * (1 - progress);
  ctx.filter = blur > 0.5 ? `blur(${blur}px)` : "none";
  ctx.globalAlpha = progress;
}
