// Applies a slide-up transition that moves content upward into place while fading it in.
export function slideUp(ctx, progress, w, h, params) {
  const dist = params.distance || 40;
  ctx.globalAlpha = progress;
  ctx.translate(0, dist * (1 - progress));
}
