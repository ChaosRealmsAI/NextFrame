function normalizeSalt(salt) {
  if (typeof salt === "number" && Number.isFinite(salt)) {
    return salt | 0;
  }

  let value = 0;
  const input = String(salt ?? "");
  for (let index = 0; index < input.length; index += 1) {
    value = Math.imul(value ^ input.charCodeAt(index), 1597334677);
  }

  return value | 0;
}

function hash(i, salt = 0) {
  const saltValue = normalizeSalt(salt);
  let x = (Math.imul(i, 374761393) + Math.imul(saltValue, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mod(value, base) {
  return ((value % base) + base) % base;
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
 * Render deterministic Matrix-style glyph rain.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Rain density and palette parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function pixelRain(t, params = {}, ctx, _globalT = 0) {
  const {
    columns = 48,
    hueStart = 140,
    hueEnd = 200,
    speed = 180,
    density = 1.2,
    charSize = 18,
    glyphPalette = "01ABCDEF",
  } = params;

  const safeColumns = Math.max(1, Math.round(Number(columns) || 48));
  const safeSpeed = Number(speed) || 180;
  const safeCharSize = Math.max(8, Number(charSize) || 18);
  const dropCount = Math.max(0, Math.floor((Number(density) || 1.2) * 6));
  const palette = String(glyphPalette || "01ABCDEF");
  const paletteLength = palette.length;
  const { width, height } = resolveSize(ctx);
  const columnWidth = width / safeColumns;
  const travelSpan = height + 100;

  ctx.save();
  ctx.fillStyle = "#020805";
  ctx.fillRect(0, 0, width, height);

  ctx.font = `500 ${safeCharSize}px "SF Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (let i = 0; i <= safeColumns; i += 1) {
    const x = i * columnWidth;

    for (let drop = 0; drop < dropCount; drop += 1) {
      const birth = hash(i, drop) * 4;
      const y = mod((t - birth + hash(i, `${drop}y`)) * safeSpeed, travelSpan) - 100;
      const charIndex = Math.floor(mod(t * 5 + i, paletteLength));
      const hue = lerp(hueStart, hueEnd, ((y / height) + (i / safeColumns)) * 0.5);
      const alpha = Math.min(1, Math.max(0, 1 - (y / height)));

      if (alpha <= 0) {
        continue;
      }

      ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${Math.min(1, alpha * 0.8)})`;
      ctx.shadowBlur = safeCharSize * 0.6;
      ctx.fillStyle = `hsla(${hue}, 100%, ${62 + alpha * 26}%, ${alpha})`;
      ctx.fillText(palette[charIndex], x, y);
    }
  }

  ctx.restore();
}
