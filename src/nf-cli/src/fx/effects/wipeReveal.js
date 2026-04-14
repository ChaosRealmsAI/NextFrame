// Applies a horizontal clip that reveals the canvas from left to right.
export function wipeReveal(ctx, progress, w, h) {
  ctx.beginPath();
  ctx.rect(0, 0, w * progress, h);
  ctx.clip();
}
