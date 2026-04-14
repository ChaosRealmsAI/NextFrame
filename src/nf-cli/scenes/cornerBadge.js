const TAU = Math.PI * 2;

function smoothstep(edge0, edge1, x) {
  const clamped = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutCubic(x) {
  return 1 - (1 - x) ** 3;
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
 * Render a broadcast-style corner badge overlay with a pulsing live indicator.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Badge copy and color parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function cornerBadge(t, params = {}, ctx, _globalT = 0) {
  const {
    label = "BREAKING",
    subtitle = "SCENE LIBRARY EXPANDS TO TEN",
    hue = 346,
    accentHue = 32,
    inset = 0.045,
  } = params;

  const { width, height } = resolveSize(ctx);
  const badgeWidth = width * 0.34;
  const badgeHeight = Math.max(54, height * 0.12);
  const margin = Math.min(width, height) * inset;
  const appear = easeOutCubic(smoothstep(0, 0.62, t));
  const x = width - margin - badgeWidth + (1 - appear) * badgeWidth * 0.24;
  const y = margin - (1 - appear) * badgeHeight * 1.15;
  const alpha = Math.max(0.001, appear);

  const ambient = ctx.createRadialGradient(width * 0.84, height * 0.12, 0, width * 0.84, height * 0.12, width * 0.24);
  ambient.addColorStop(0, `hsla(${hue}, 100%, 60%, ${0.12 * alpha})`);
  ambient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;

  const card = ctx.createLinearGradient(0, 0, badgeWidth, badgeHeight);
  card.addColorStop(0, "rgba(12, 14, 24, 0.94)");
  card.addColorStop(1, "rgba(19, 8, 16, 0.92)");
  ctx.shadowColor = `hsla(${hue}, 100%, 55%, ${0.45 * alpha})`;
  ctx.shadowBlur = 24;
  ctx.fillStyle = card;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(badgeWidth - 26, 0);
  ctx.lineTo(badgeWidth, badgeHeight * 0.38);
  ctx.lineTo(badgeWidth, badgeHeight);
  ctx.lineTo(0, badgeHeight);
  ctx.lineTo(0, 16);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  const accentWidth = badgeWidth * 0.34;
  const accent = ctx.createLinearGradient(0, 0, accentWidth, 0);
  accent.addColorStop(0, `hsla(${accentHue}, 100%, 62%, 0.96)`);
  accent.addColorStop(1, `hsla(${hue}, 100%, 62%, 0.9)`);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, accentWidth, badgeHeight);

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.fillRect(accentWidth, 0, 1, badgeHeight);

  const pulse = 0.82 + 0.18 * Math.sin(t * TAU * 1.4);
  const dotX = 18;
  const dotY = badgeHeight * 0.72;
  ctx.fillStyle = `rgba(255, 255, 255, ${0.18 * pulse})`;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 13 * pulse, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `hsla(${accentHue}, 100%, 76%, 1)`;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 5.5 * pulse, 0, TAU);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.max(14, badgeHeight * 0.26)}px -apple-system, "SF Pro Display", "PingFang SC", sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fillText(label, 34, badgeHeight * 0.36);

  ctx.font = `600 ${Math.max(10, badgeHeight * 0.16)}px "SF Mono", Menlo, monospace`;
  ctx.fillStyle = "rgba(240, 243, 255, 0.82)";
  ctx.fillText(subtitle, accentWidth + 18, badgeHeight * 0.54);

  ctx.fillStyle = `hsla(${hue}, 100%, 68%, 0.85)`;
  ctx.fillRect(accentWidth + 18, badgeHeight * 0.72, badgeWidth * 0.24, 2);
  ctx.restore();
}
