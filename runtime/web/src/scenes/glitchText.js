const SYSTEM_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function hashString(value) {
  let result = 2166136261;
  const text = String(value ?? "");

  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }

  return result >>> 0;
}

function hash(seed, salt = "") {
  let value = (Math.imul((seed | 0) ^ 0x9e3779b9, 1597334677) ^ hashString(salt)) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 2246822519) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 3266489917) >>> 0;
  value ^= value >>> 16;
  return value / 4294967295;
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

function coerceNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function measureTextBounds(ctx, text, centerX, centerY, fontSize) {
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.72;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.24;
  const width = metrics.width || fontSize;
  const padX = Math.max(12, fontSize * 0.18);
  const padY = Math.max(10, fontSize * 0.15);
  return {
    left: centerX - width / 2 - padX,
    top: centerY - ascent - padY,
    width: width + padX * 2,
    height: ascent + descent + padY * 2,
  };
}

function getBandOffsets(t, glitchAmount, bounds) {
  const timeStep = Math.floor(t * 14);
  const bandCount = 3 + Math.floor(hash(timeStep, "band-count") * 2);
  const offsets = [];
  const burstScale = glitchAmount * Math.max(24, bounds.width * 0.035);

  for (let index = 0; index < bandCount; index += 1) {
    offsets.push((hash(timeStep + index, "band-offset") * 2 - 1) * burstScale);
  }

  return offsets;
}

function drawLayer(ctx, text, centerX, centerY, fillStyle, offsetX, shadowColor, shadowBlur) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.fillText(text, centerX + offsetX, centerY);
  ctx.restore();
}

function drawBurstLayer(ctx, text, centerX, centerY, bounds, fillStyle, offsetX, shadowColor, shadowBlur, bandOffsets) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;

  const bandHeight = bounds.height / bandOffsets.length;
  for (let index = 0; index < bandOffsets.length; index += 1) {
    const bandY = bounds.top + index * bandHeight;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.left, bandY, bounds.width, bandHeight + 1);
    ctx.clip();
    ctx.fillText(text, centerX + offsetX + bandOffsets[index], centerY);
    ctx.restore();
  }

  ctx.restore();
}

function drawScanlines(ctx, bounds) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height);
  ctx.clip();
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  for (let y = Math.floor(bounds.top); y < bounds.top + bounds.height; y += 4) {
    ctx.fillRect(bounds.left, y, bounds.width, 2);
  }
  ctx.restore();
}

/**
 * Render a glitchy cyberpunk title with chromatic channel splitting and scanline bursts.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Text, palette, and glitch controls.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function glitchText(t, params = {}, ctx, _globalT = 0) {
  const {
    text = "GLITCH",
    fontSize = 140,
    weight = "900",
    baseHue = 320,
    glitchAmount = 0.4,
    scanlines = true,
    burstFreq = 2.5,
  } = params;

  const { width, height } = resolveSize(ctx);
  const safeText = String(text || "GLITCH");
  const safeFontSize = Math.max(24, coerceNumber(fontSize, 140));
  const safeBaseHue = ((coerceNumber(baseHue, 320) % 360) + 360) % 360;
  const safeGlitchAmount = Math.max(0, coerceNumber(glitchAmount, 0.4));
  const safeBurstFreq = Math.max(0, coerceNumber(burstFreq, 2.5));
  const scanlineEnabled = scanlines !== false && scanlines !== "false";
  const frameStep = Math.floor(t * 10);
  const burstActive = Math.sin(t * safeBurstFreq) > 0.6;
  const channelOffset = (hash(frameStep, "r") * 2 - 1) * safeGlitchAmount * 12;
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, `hsl(${safeBaseHue}, 30%, 5%)`);
  background.addColorStop(0.55, "hsl(224, 22%, 4%)");
  background.addColorStop(1, `hsl(${(safeBaseHue + 40) % 360}, 36%, 8%)`);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const ambient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * 0.45);
  ambient.addColorStop(0, `hsla(${safeBaseHue}, 100%, 60%, 0.24)`);
  ambient.addColorStop(0.65, `hsla(${(safeBaseHue + 48) % 360}, 90%, 42%, 0.08)`);
  ambient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.font = `${String(weight || "900")} ${safeFontSize}px ${SYSTEM_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const bounds = measureTextBounds(ctx, safeText, centerX, centerY, safeFontSize);
  const bandOffsets = burstActive ? getBandOffsets(t, safeGlitchAmount, bounds) : null;

  if (burstActive && bandOffsets) {
    drawBurstLayer(
      ctx,
      safeText,
      centerX,
      centerY,
      "rgba(255, 42, 109, 0.82)",
      channelOffset,
      "rgba(255, 42, 109, 0.65)",
      18,
      bandOffsets,
    );
    drawBurstLayer(
      ctx,
      safeText,
      centerX,
      centerY,
      "rgba(44, 245, 255, 0.82)",
      -channelOffset,
      "rgba(44, 245, 255, 0.65)",
      18,
      bandOffsets,
    );
    drawBurstLayer(
      ctx,
      safeText,
      centerX,
      centerY,
      bounds,
      "rgba(255, 255, 255, 0.94)",
      0,
      `hsla(${safeBaseHue}, 100%, 80%, 0.5)`,
      14,
      bandOffsets,
    );
  } else {
    drawLayer(
      ctx,
      safeText,
      centerX,
      centerY,
      "rgba(255, 42, 109, 0.82)",
      channelOffset,
      "rgba(255, 42, 109, 0.65)",
      18,
    );
    drawLayer(
      ctx,
      safeText,
      centerX,
      centerY,
      "rgba(44, 245, 255, 0.82)",
      -channelOffset,
      "rgba(44, 245, 255, 0.65)",
      18,
    );
    drawLayer(
      ctx,
      safeText,
      centerX,
      centerY,
      "rgba(255, 255, 255, 0.94)",
      0,
      `hsla(${safeBaseHue}, 100%, 80%, 0.5)`,
      14,
    );
  }

  if (scanlineEnabled) {
    drawScanlines(ctx, bounds);
  }

  ctx.restore();
}
