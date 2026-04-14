const TAU = Math.PI * 2;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }

  return fallback;
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
 * Render concentric orbital rings with planets moving at alternating speeds.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Orbital system parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function orbitRings(t, params = {}, ctx, _globalT = 0) {
  const {
    ringCount = 6,
    hueA = 180,
    hueB = 320,
    baseSpeed = 0.4,
    dotSize = 10,
    ringWidth = 1.5,
    glow = true,
  } = params;

  const { width, height } = resolveSize(ctx);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const minSide = Math.min(width, height);
  const ringMax = Math.max(0, Math.round(ringCount));
  const showGlow = normalizeBoolean(glow, true);

  const background = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, minSide * 0.7);
  background.addColorStop(0, "hsla(220, 45%, 11%, 1)");
  background.addColorStop(0.55, "hsla(232, 42%, 6%, 1)");
  background.addColorStop(1, "hsla(244, 38%, 3%, 1)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const coreGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, minSide * 0.18);
  coreGlow.addColorStop(0, `hsla(${hueA}, 95%, 70%, 0.22)`);
  coreGlow.addColorStop(0.45, `hsla(${lerp(hueA, hueB, 0.5)}, 95%, 56%, 0.09)`);
  coreGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = coreGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = ringWidth;

  for (let i = 0; i <= ringMax; i += 1) {
    const progress = ringMax === 0 ? 0 : i / ringMax;
    const hue = lerp(hueA, hueB, progress);
    const radius = (i + 1) * minSide / (Math.max(1, ringMax) * 2.4);
    const speed = baseSpeed * (1 - i * 0.1);
    const angle = t * speed * (i % 2 === 0 ? 1 : -1);
    const dotCount = i + 2;

    ctx.strokeStyle = `hsla(${hue}, 90%, 68%, 0.4)`;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, TAU);
    ctx.stroke();

    for (let dotIndex = 0; dotIndex < dotCount; dotIndex += 1) {
      const dotAngle = angle + (dotIndex / dotCount) * TAU;
      const x = centerX + Math.cos(dotAngle) * radius;
      const y = centerY + Math.sin(dotAngle) * radius;

      if (showGlow) {
        ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.3)`;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, TAU);
        ctx.fill();
      }

      ctx.fillStyle = `hsla(${hue}, 100%, 78%, 1)`;
      ctx.beginPath();
      ctx.arc(x, y, dotSize * 0.5, 0, TAU);
      ctx.fill();
    }
  }

  const starCount = 48;
  for (let i = 0; i < starCount; i += 1) {
    const x = ((i * 73) % 997) / 997 * width;
    const y = ((i * 131) % 991) / 991 * height;
    const size = 0.8 + ((i * 47) % 11) * 0.14;
    const alpha = 0.16 + ((i * 29) % 7) * 0.03;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(x, y, size, size);
  }
}
