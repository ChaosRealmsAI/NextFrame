// Applies an increasing blur while fading the canvas content out.
export function blurOut(ctx, progress) {
  const blur = 20 * progress;
  ctx.filter = blur > 0.5 ? `blur(${blur}px)` : "none";
  ctx.globalAlpha = 1 - progress;
}
