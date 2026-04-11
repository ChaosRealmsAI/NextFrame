function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
 * Render a faux audio waveform with pulsing bars and mirrored reflection.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Waveform density, palette, and glow parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function dataPulse(t, params = {}, ctx, _globalT = 0) {
  const {
    bars = 64,
    hueA = 180,
    hueB = 320,
    peak = 0.8,
    baseHeight = 0.15,
    smoothness = 0.25,
    glowAlpha = 0.4,
  } = params;

  const safeBars = Math.max(3, Math.round(bars));
  const safePeak = Math.max(0, peak);
  const safeBaseHeight = Math.max(0, baseHeight);
  const safeSmoothness = clamp(smoothness, 0, 1);
  const safeGlowAlpha = clamp(glowAlpha, 0, 1);
  const { width, height } = resolveSize(ctx);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const spanWidth = width * 0.78;
  const gap = spanWidth * 0.006;
  const barWidth = Math.max(1, (spanWidth - gap * (safeBars - 1)) / safeBars);
  const waveformWidth = barWidth * safeBars + gap * (safeBars - 1);
  const originX = centerX - waveformWidth * 0.5;
  const maxBarHeight = height * 0.34;

  const backdrop = ctx.createLinearGradient(0, 0, 0, height);
  backdrop.addColorStop(0, "#04111a");
  backdrop.addColorStop(0.5, "#02070f");
  backdrop.addColorStop(1, "#010306");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);

  const ambient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.hypot(width, height) * 0.55);
  ambient.addColorStop(0, `hsla(${lerp(hueA, hueB, 0.5)}, 95%, 55%, 0.16)`);
  ambient.addColorStop(0.5, `hsla(${hueA}, 90%, 45%, 0.08)`);
  ambient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);

  const rawHeights = Array.from({ length: safeBars }, (_, index) => {
    const wave = Math.sin(index * 0.4 + t * 2.5) * 0.4 + Math.sin(index * 0.13 + t * 1.7) * 0.6;
    return safeBaseHeight + wave * safePeak;
  });

  const smoothedHeights = rawHeights.map((value, index) => {
    const left = rawHeights[Math.max(0, index - 1)];
    const right = rawHeights[Math.min(safeBars - 1, index + 1)];
    const average = (left + value + right) / 3;
    return lerp(value, average, safeSmoothness);
  });

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let index = 0; index < safeBars; index += 1) {
    const heightScale = clamp(smoothedHeights[index], 0, 1);
    const barHeight = maxBarHeight * heightScale;
    const x = originX + index * (barWidth + gap);
    const hue = lerp(hueA, hueB, index / safeBars);

    if (barHeight <= 0) {
      continue;
    }

    const glowGradient = ctx.createLinearGradient(0, centerY - barHeight, 0, centerY);
    glowGradient.addColorStop(0, `hsla(${hue}, 100%, 72%, ${safeGlowAlpha * 0.85})`);
    glowGradient.addColorStop(1, `hsla(${hue}, 100%, 45%, 0)`);
    ctx.fillStyle = glowGradient;
    ctx.fillRect(x - barWidth * 0.3, centerY - barHeight, barWidth * 1.6, barHeight);

    const barGradient = ctx.createLinearGradient(0, centerY - barHeight, 0, centerY);
    barGradient.addColorStop(0, `hsla(${hue}, 100%, 76%, 0.98)`);
    barGradient.addColorStop(0.55, `hsla(${hue}, 95%, 62%, 0.92)`);
    barGradient.addColorStop(1, `hsla(${hue}, 92%, 48%, 0.86)`);
    ctx.fillStyle = barGradient;
    ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);

    const reflectionGradient = ctx.createLinearGradient(0, centerY, 0, centerY + barHeight);
    reflectionGradient.addColorStop(0, `hsla(${hue}, 100%, 76%, 0.3)`);
    reflectionGradient.addColorStop(1, `hsla(${hue}, 90%, 38%, 0)`);
    ctx.fillStyle = reflectionGradient;
    ctx.fillRect(x, centerY, barWidth, barHeight);
  }

  const centerGlow = ctx.createLinearGradient(0, centerY - 1, 0, centerY + 1);
  centerGlow.addColorStop(0, "rgba(255, 255, 255, 0)");
  centerGlow.addColorStop(0.5, `hsla(${lerp(hueA, hueB, 0.5)}, 100%, 86%, 0.55)`);
  centerGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(originX - gap, centerY - 1, waveformWidth + gap * 2, 2);

  const vignette = ctx.createRadialGradient(centerX, centerY, Math.min(width, height) * 0.18, centerX, centerY, Math.hypot(width, height) * 0.74);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.58)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
