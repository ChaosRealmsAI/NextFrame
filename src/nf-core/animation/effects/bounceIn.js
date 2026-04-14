// Applies a bounce-in scale effect while fading the canvas content into view.
export function bounceIn(ctx, progress, w, h) {
  const n = 7.5625;
  const d = 2.75;
  let bounceProgress;
  if (progress < 1 / d) {
    bounceProgress = n * progress * progress;
  } else if (progress < 2 / d) {
    const p = progress - 1.5 / d;
    bounceProgress = n * p * p + 0.75;
  } else if (progress < 2.5 / d) {
    const p = progress - 2.25 / d;
    bounceProgress = n * p * p + 0.9375;
  } else {
    const p = progress - 2.625 / d;
    bounceProgress = n * p * p + 0.984375;
  }

  const scale = 0.3 + bounceProgress * 0.7;
  ctx.globalAlpha = progress;
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
}
