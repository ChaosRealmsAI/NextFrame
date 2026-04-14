// Applies a bounce-in scale effect while fading the canvas content into view.
export function bounceIn(ctx, progress, w, h) {
  const n = 7.5625;
  const d = 2.75;
  let bounceProgress;
  if (progress < 1 / d) {
    bounceProgress = n * progress * progress;
  } else if (progress < 2 / d) {
    progress -= 1.5 / d;
    bounceProgress = n * progress * progress + 0.75;
  } else if (progress < 2.5 / d) {
    progress -= 2.25 / d;
    bounceProgress = n * progress * progress + 0.9375;
  } else {
    progress -= 2.625 / d;
    bounceProgress = n * progress * progress + 0.984375;
  }
  ctx.globalAlpha = bounceProgress;
  ctx.translate(w / 2, h / 2);
  ctx.scale(bounceProgress, bounceProgress);
  ctx.translate(-w / 2, -h / 2);
}
