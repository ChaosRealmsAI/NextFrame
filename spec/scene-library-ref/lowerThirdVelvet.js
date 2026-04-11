// ============================================================
// lowerThirdVelvet — Category: Overlays
// ----------------------------------------------------------------
// Premium lower-third (name tag) with a gradient bar that wipes in
// from the left, the title slides up from a mask, and an accent
// dot pulses. Intended to sit on top of a video clip.
// ============================================================

const TAU = Math.PI * 2;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function easeInCubic(x) {
  return x * x * x;
}

export function lowerThirdVelvet(t, params = {}, ctx, globalT = 0) {
  const {
    title = 'ZHANG SAN',
    subtitle = 'Founder · NextFrame',
    hueA = 20,     // orange
    hueB = 320,    // pink
    holdEnd = 4.0, // seconds when it starts fading out
    fadeOut = 0.6,
  } = params;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // --- Position: lower third, left-aligned ---
  const barH = Math.max(38, H * 0.085);
  const barY = H * 0.78;
  const padX = W * 0.08;

  // --- Reveal envelopes ---
  const wipeIn = easeOutCubic(smoothstep(0, 0.55, t));
  const textIn = easeOutCubic(smoothstep(0.35, 0.9, t));
  const out = 1 - easeInCubic(smoothstep(holdEnd, holdEnd + fadeOut, t));
  const alpha = Math.min(1, out);
  if (alpha <= 0) return;

  // --- Gradient bar ---
  const barW = W * 0.55 * wipeIn;
  const grad = ctx.createLinearGradient(padX, 0, padX + W * 0.55, 0);
  grad.addColorStop(0, `hsla(${hueA}, 100%, 60%, ${0.95 * alpha})`);
  grad.addColorStop(0.55, `hsla(${(hueA + hueB) / 2}, 100%, 62%, ${0.85 * alpha})`);
  grad.addColorStop(1, `hsla(${hueB}, 100%, 58%, ${0.1 * alpha})`);

  // Soft shadow under bar
  ctx.shadowColor = `hsla(${hueA}, 90%, 50%, ${0.5 * alpha})`;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = grad;
  // Rounded-left bar
  const r = barH / 2;
  ctx.beginPath();
  ctx.moveTo(padX + r, barY);
  ctx.lineTo(padX + barW, barY);
  ctx.lineTo(padX + barW, barY + barH);
  ctx.lineTo(padX + r, barY + barH);
  ctx.arcTo(padX, barY + barH, padX, barY + barH - r, r);
  ctx.lineTo(padX, barY + r);
  ctx.arcTo(padX, barY, padX + r, barY, r);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // --- Accent pulsing dot on the left ---
  const dotCx = padX + barH * 0.55;
  const dotCy = barY + barH / 2;
  const pulse = 0.75 + 0.25 * Math.sin(t * TAU * 1.2);
  const dotR = barH * 0.14 * pulse;
  ctx.fillStyle = `rgba(255,255,255,${0.95 * alpha})`;
  ctx.shadowColor = `hsla(${hueA}, 100%, 70%, ${0.9 * alpha})`;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(dotCx, dotCy, dotR, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  // --- Text block (title + subtitle) ---
  ctx.save();

  // Clip to the bar area so text slides up from inside it
  ctx.beginPath();
  ctx.rect(padX, barY - H * 0.15, W, barH + H * 0.15);
  ctx.clip();

  const textX = padX + barH * 1.1;
  const titleSize = Math.max(16, barH * 0.45);
  const subSize = Math.max(11, barH * 0.22);
  const titleY = barY + barH * 0.42 + (1 - textIn) * barH * 0.6;
  const subY = barY + barH * 0.72 + (1 - textIn) * barH * 0.6;

  ctx.font = `900 ${titleSize}px -apple-system, "SF Pro Display", "PingFang SC", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,255,255,${alpha * textIn})`;
  ctx.fillText(title, textX, titleY);

  ctx.font = `600 ${subSize}px "SF Mono", Menlo, monospace`;
  ctx.fillStyle = `rgba(255,255,255,${0.75 * alpha * textIn})`;
  ctx.fillText(subtitle, textX, subY);

  ctx.restore();

  // --- Thin stroke accent under the bar ---
  const strokeW = barW * 0.6;
  const strokeGrad = ctx.createLinearGradient(padX, 0, padX + strokeW, 0);
  strokeGrad.addColorStop(0, `rgba(255,255,255,${0.7 * alpha})`);
  strokeGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = strokeGrad;
  ctx.fillRect(padX, barY + barH + 3, strokeW, 1.5);
}
