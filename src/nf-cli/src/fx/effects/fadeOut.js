// Applies a fade-out transition by lowering canvas alpha with progress.
export function fadeOut(ctx, progress) {
  ctx.globalAlpha = 1 - progress;
}
