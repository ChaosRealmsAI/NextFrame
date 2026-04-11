const TAU = Math.PI * 2;

function smoothstep(edge0, edge1, x) {
  const clamped = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutCubic(x) {
  return 1 - (1 - x) ** 3;
}

function easeInCubic(x) {
  return x ** 3;
}

function resolveSize(ctx) {
  const rect = typeof ctx?.canvas?.getBoundingClientRect === "function"
    ? ctx.canvas.getBoundingClientRect()
    : null;
  const fallbackWidth = rect?.width || ctx?.canvas?.clientWidth || ctx?.canvas?.width || 1;
  const fallbackHeight = rect?.height || ctx?.canvas?.clientHeight || ctx?.canvas?.height || 1;
  return {
    width: fallbackWidth,
    height: fallbackHeight,
  };
}

/**
 * Render a velvet-style lower third overlay with wipe and fade envelopes.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Lower-third copy and styling parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function lowerThirdVelvet(t, params = {}, ctx, _globalT = 0) {
  const {
    title = "NEXTFRAME",
    subtitle = "Scene Registry Demo",
    hueA = 20,
    hueB = 320,
    holdEnd = 4,
    fadeOut = 0.6,
  } = params;

  const { width, height } = resolveSize(ctx);
  const barHeight = Math.max(38, height * 0.085);
  const barY = height * 0.78;
  const padX = width * 0.08;
  const wipeIn = easeOutCubic(smoothstep(0, 0.55, t));
  const textIn = easeOutCubic(smoothstep(0.35, 0.9, t));
  const alpha = Math.min(1, 1 - easeInCubic(smoothstep(holdEnd, holdEnd + fadeOut, t)));

  if (alpha <= 0) {
    return;
  }

  const barWidth = width * 0.55 * wipeIn;
  const gradient = ctx.createLinearGradient(padX, 0, padX + width * 0.55, 0);
  gradient.addColorStop(0, `hsla(${hueA}, 100%, 60%, ${0.95 * alpha})`);
  gradient.addColorStop(0.55, `hsla(${(hueA + hueB) / 2}, 100%, 62%, ${0.85 * alpha})`);
  gradient.addColorStop(1, `hsla(${hueB}, 100%, 58%, ${0.1 * alpha})`);

  ctx.shadowColor = `hsla(${hueA}, 90%, 50%, ${0.5 * alpha})`;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = gradient;
  const radius = barHeight / 2;
  ctx.beginPath();
  ctx.moveTo(padX + radius, barY);
  ctx.lineTo(padX + barWidth, barY);
  ctx.lineTo(padX + barWidth, barY + barHeight);
  ctx.lineTo(padX + radius, barY + barHeight);
  ctx.arcTo(padX, barY + barHeight, padX, barY + barHeight - radius, radius);
  ctx.lineTo(padX, barY + radius);
  ctx.arcTo(padX, barY, padX + radius, barY, radius);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const dotX = padX + barHeight * 0.55;
  const dotY = barY + barHeight / 2;
  const dotRadius = barHeight * 0.14 * (0.75 + 0.25 * Math.sin(t * TAU * 1.2));
  ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * alpha})`;
  ctx.shadowColor = `hsla(${hueA}, 100%, 70%, ${0.9 * alpha})`;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotRadius, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(padX, barY - height * 0.15, width, barHeight + height * 0.15);
  ctx.clip();

  const textX = padX + barHeight * 1.1;
  const titleSize = Math.max(16, barHeight * 0.45);
  const subtitleSize = Math.max(11, barHeight * 0.22);
  const titleY = barY + barHeight * 0.42 + (1 - textIn) * barHeight * 0.6;
  const subtitleY = barY + barHeight * 0.72 + (1 - textIn) * barHeight * 0.6;

  ctx.font = `900 ${titleSize}px -apple-system, "SF Pro Display", "PingFang SC", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha * textIn})`;
  ctx.fillText(title, textX, titleY);

  ctx.font = `600 ${subtitleSize}px "SF Mono", Menlo, monospace`;
  ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * alpha * textIn})`;
  ctx.fillText(subtitle, textX, subtitleY);
  ctx.restore();

  const strokeWidth = barWidth * 0.6;
  const strokeGradient = ctx.createLinearGradient(padX, 0, padX + strokeWidth, 0);
  strokeGradient.addColorStop(0, `rgba(255, 255, 255, ${0.7 * alpha})`);
  strokeGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = strokeGradient;
  ctx.fillRect(padX, barY + barHeight + 3, strokeWidth, 1.5);
}
