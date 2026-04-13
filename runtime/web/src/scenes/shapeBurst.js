import { TAU, lerp } from "../engine/math.js";

function hash(i, salt = "") {
  let x = Math.imul(i + 1, 374761393);
  const saltText = String(salt);

  for (let index = 0; index < saltText.length; index += 1) {
    x = Math.imul(x ^ saltText.charCodeAt(index), 668265263);
  }

  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967295;
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

function resolveShape(shape, i) {
  if (shape === "circle" || shape === "triangle" || shape === "square") {
    return shape;
  }

  const pick = Math.floor(hash(i, "m") * 3);
  return ["circle", "triangle", "square"][pick] || "circle";
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

function drawCircle(ctx, size) {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.5, 0, TAU);
  ctx.fill();
}

function drawTriangle(ctx, size) {
  const radius = size * 0.62;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(radius * 0.92, radius * 0.78);
  ctx.lineTo(-radius * 0.92, radius * 0.78);
  ctx.closePath();
  ctx.fill();
}

function drawSquare(ctx, size) {
  const half = size * 0.5;
  ctx.fillRect(-half, -half, size, size);
}

/**
 * Render a deterministic geometric burst expanding from the frame center.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Burst particle parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function shapeBurst(t, params = {}, ctx, _globalT = 0) {
  const {
    count = 80,
    shape = "mixed",
    hueStart = 200,
    hueEnd = 320,
    sizeMin = 12,
    sizeMax = 48,
    speed = 320,
    gravity = 120,
    fadeOut = true,
  } = params;

  const { width, height } = resolveSize(ctx);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const diagonal = Math.hypot(width, height);
  const maxRadius = diagonal * 0.75;
  const safeSpeed = Math.max(1, speed);
  const particleCount = Math.max(1, Math.floor(count));
  const lifespan = Math.max(0.9, maxRadius / safeSpeed);
  const shouldFadeOut = normalizeBoolean(fadeOut, true);

  const background = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, diagonal * 0.7);
  background.addColorStop(0, `hsla(${hueStart}, 42%, 16%, 1)`);
  background.addColorStop(0.42, "rgba(10, 14, 24, 0.98)");
  background.addColorStop(1, "rgba(2, 4, 10, 1)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const core = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(width, height) * 0.16);
  core.addColorStop(0, `hsla(${lerp(hueStart, hueEnd, 0.25)}, 100%, 80%, 0.35)`);
  core.addColorStop(0.6, `hsla(${lerp(hueStart, hueEnd, 0.6)}, 100%, 60%, 0.12)`);
  core.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let i = 0; i <= particleCount; i += 1) {
    const birth = hash(i, "b") * 0.6;
    if (t < birth) {
      continue;
    }

    const angle = (i / particleCount) * TAU + hash(i, "a") * 0.3;
    const localTime = Math.max(0, t - birth);
    const radius = safeSpeed * localTime;
    const dropY = gravity * localTime * localTime * 0.5;
    const size = lerp(sizeMin, sizeMax, hash(i, "s"));
    const hue = lerp(hueStart, hueEnd, i / particleCount);
    const alpha = shouldFadeOut ? 1 - localTime / lifespan : 1;

    if (alpha <= 0) {
      continue;
    }

    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius + dropY;
    if (x < -size || x > width + size || y < -size || y > height + size) {
      continue;
    }

    const rotation = angle + hash(i, "r") * TAU + localTime * (0.8 + hash(i, "w") * 1.4);
    const particleShape = resolveShape(shape, i);
    const lightness = lerp(74, 56, hash(i, "l"));
    const fillAlpha = Math.max(0, Math.min(1, alpha));

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = `hsla(${hue}, 96%, ${lightness}%, ${fillAlpha})`;
    ctx.shadowColor = `hsla(${hue}, 100%, 72%, ${fillAlpha * 0.9})`;
    ctx.shadowBlur = size * 0.65;

    if (particleShape === "triangle") {
      drawTriangle(ctx, size);
    } else if (particleShape === "square") {
      drawSquare(ctx, size);
    } else {
      drawCircle(ctx, size);
    }

    ctx.restore();
  }

  ctx.restore();
}
