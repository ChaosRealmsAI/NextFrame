import { loadImage } from "../_image-cache.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resolveSize(ctx, fallbackWidth = 0, fallbackHeight = 0) {
  const rect = typeof ctx?.canvas?.getBoundingClientRect === "function"
    ? ctx.canvas.getBoundingClientRect()
    : null;
  const width = fallbackWidth || rect?.width || ctx?.canvas?.clientWidth || ctx?.canvas?.width || 1;
  const height = fallbackHeight || rect?.height || ctx?.canvas?.clientHeight || ctx?.canvas?.height || 1;
  return { width, height };
}

function isImageReady(image) {
  return Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

function hasImageFailed(image) {
  return Boolean(image?.complete && (!image.naturalWidth || !image.naturalHeight));
}

function normalizeFit(fit) {
  return fit === "contain" ? "contain" : "cover";
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

function drawPlaceholder(ctx, width, height, failed = false) {
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, failed ? "#191116" : "#090b12");
  background.addColorStop(0.55, failed ? "#110c12" : "#0d1018");
  background.addColorStop(1, "#020304");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.72, height * 0.28, 0, width * 0.72, height * 0.28, width * 0.8);
  glow.addColorStop(0, failed ? "rgba(192, 96, 120, 0.18)" : "rgba(92, 124, 250, 0.18)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = failed ? "rgba(255, 150, 165, 0.12)" : "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0025);
  const spacing = Math.max(20, Math.min(width, height) * 0.09);
  for (let offset = -height; offset < width + height; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(offset, height);
    ctx.lineTo(offset + height, 0);
    ctx.stroke();
  }

  const vignette = ctx.createLinearGradient(0, 0, 0, height);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0.14)");
  vignette.addColorStop(0.5, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function computeDrawRect(image, width, height, fit, zoom, offsetX, offsetY, holdEdges) {
  const scaleX = width / image.naturalWidth;
  const scaleY = height / image.naturalHeight;
  const baseScale = fit === "contain" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
  const safeZoom = Math.max(0.01, zoom);
  const drawWidth = image.naturalWidth * baseScale * safeZoom;
  const drawHeight = image.naturalHeight * baseScale * safeZoom;
  const baseX = (width - drawWidth) * 0.5;
  const baseY = (height - drawHeight) * 0.5;
  const minX = Math.min(0, width - drawWidth);
  const maxX = Math.max(0, width - drawWidth);
  const minY = Math.min(0, height - drawHeight);
  const maxY = Math.max(0, height - drawHeight);

  if (!holdEdges) {
    return {
      drawWidth,
      drawHeight,
      drawX: baseX + offsetX,
      drawY: baseY + offsetY,
    };
  }

  return {
    drawWidth,
    drawHeight,
    drawX: clamp(baseX + offsetX, minX, maxX),
    drawY: clamp(baseY + offsetY, minY, maxY),
  };
}

/**
 * Render a still image with a frame-pure Ken Burns zoom and pan.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Image source and camera motion parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @param {number} [canvasWidth=0] - Resolved canvas display width.
 * @param {number} [canvasHeight=0] - Resolved canvas display height.
 * @param {number} [clipDuration=0] - Active clip duration in seconds.
 * @returns {void}
 */
export function imageHero(
  t,
  params = {},
  ctx,
  _globalT = 0,
  canvasWidth = 0,
  canvasHeight = 0,
  clipDuration = 0,
) {
  const {
    src = null,
    fit = "cover",
    zoomStart = 1,
    zoomEnd = 1.15,
    panX = 0.05,
    panY = -0.03,
    holdEdges = true,
  } = params;

  const { width, height } = resolveSize(ctx, canvasWidth, canvasHeight);
  const image = loadImage(src);
  const failed = !image && typeof src === "string" && src.length > 0 ? true : hasImageFailed(image);

  if (!isImageReady(image)) {
    drawPlaceholder(ctx, width, height, failed);
    return;
  }

  const safeDuration = Math.max(Number(clipDuration) || 0, Math.max(Number(t) || 0, 0), 0.000001);
  const progress = clamp((Number(t) || 0) / safeDuration, 0, 1);
  const currentZoom = (Number(zoomStart) || 1) + ((Number(zoomEnd) || 1.15) - (Number(zoomStart) || 1)) * progress;
  const offsetX = width * (Number(panX) || 0) * (Number(t) || 0);
  const offsetY = height * (Number(panY) || 0) * (Number(t) || 0);
  const safeHoldEdges = normalizeBoolean(holdEdges, true);
  const drawRect = computeDrawRect(
    image,
    width,
    height,
    normalizeFit(fit),
    currentZoom,
    offsetX,
    offsetY,
    safeHoldEdges,
  );

  ctx.drawImage(image, drawRect.drawX, drawRect.drawY, drawRect.drawWidth, drawRect.drawHeight);
}
