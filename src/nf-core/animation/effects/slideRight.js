// Applies a rightward slide effect while fading the canvas content into view.
export function slideRight(ctx, progress, w, h, params) {
  const dist = params.distance || 40;
  ctx.globalAlpha = progress;
  ctx.translate(dist * (1 - progress), 0);
}
