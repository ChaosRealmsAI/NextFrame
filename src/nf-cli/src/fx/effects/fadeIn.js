// Applies a fade-in transition by ramping canvas alpha with progress.
export function fadeIn(ctx, progress) {
  ctx.globalAlpha = progress;
}
