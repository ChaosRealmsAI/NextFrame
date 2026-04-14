// Applies a slide-down transition that moves content downward while fading it out.
export function slideDown(ctx, progress, w, h, params) {
  const dist = params.distance || 40;
  ctx.globalAlpha = 1 - progress;
  ctx.translate(0, dist * progress);
}
