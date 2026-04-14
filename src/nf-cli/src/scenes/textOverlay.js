const EXIT_DURATION = 0.4;
const SYSTEM_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const VALID_ALIGNMENTS = new Set(["left", "center", "right"]);
const VALID_ANCHORS = new Set([
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

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

function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function measureLine(ctx, line, spacingPx) {
  if (line.length === 0) {
    return 0;
  }

  let width = 0;
  for (let index = 0; index < line.length; index += 1) {
    width += ctx.measureText(line[index]).width;
    if (index < line.length - 1) {
      width += spacingPx;
    }
  }

  return width;
}

function drawLine(ctx, line, startX, y, spacingPx) {
  let cursorX = startX;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    ctx.fillText(character, cursorX, y);
    cursorX += ctx.measureText(character).width;
    if (index < line.length - 1) {
      cursorX += spacingPx;
    }
  }
}

function resolveAnchorPosition(width, height, blockWidth, blockHeight, anchor, inset) {
  let left = (width - blockWidth) / 2;
  let top = (height - blockHeight) / 2;

  if (anchor.includes("left")) {
    left = inset;
  } else if (anchor.includes("right")) {
    left = width - inset - blockWidth;
  }

  if (anchor.startsWith("top")) {
    top = inset;
  } else if (anchor.startsWith("bottom")) {
    top = height - inset - blockHeight;
  }

  return { left, top };
}

function normalizeAlignment(value) {
  return VALID_ALIGNMENTS.has(value) ? value : "center";
}

function normalizeAnchor(value) {
  return VALID_ANCHORS.has(value) ? value : "center";
}

/**
 * Render a configurable text overlay with frame-pure timing envelopes.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Text and animation parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function textOverlay(t, params = {}, ctx, _globalT = 0) {
  const {
    text = "Your text here",
    fontSize = 96,
    color = "#ffffff",
    align = "center",
    anchor = "center",
    weight = "800",
    letterSpacing = -0.02,
    enterDur = 0.6,
    holdDur = 2.5,
  } = params;

  const safeEnterDur = Math.max(0.001, Number(enterDur) || 0.6);
  const safeHoldDur = Math.max(0, Number(holdDur) || 2.5);
  const exitStart = safeEnterDur + safeHoldDur;
  const endTime = exitStart + EXIT_DURATION;

  if (t < 0 || t >= endTime) {
    return;
  }

  let alpha = 1;
  let offsetY = 0;

  if (t < safeEnterDur) {
    const reveal = easeOutCubic(smoothstep(0, safeEnterDur, t));
    alpha = reveal;
    offsetY = (1 - reveal) * 40;
  } else if (t > exitStart) {
    alpha = 1 - smoothstep(exitStart, endTime, t);
  }

  if (alpha <= 0.001) {
    return;
  }

  const safeFontSize = Math.max(12, Number(fontSize) || 96);
  const spacingPx = safeFontSize * (Number(letterSpacing) || 0);
  const lines = normalizeText(text).split("\n");
  const safeAlign = normalizeAlignment(align);
  const safeAnchor = normalizeAnchor(anchor);
  const { width, height } = resolveSize(ctx);
  const lineHeight = Math.max(safeFontSize * 1.08, safeFontSize + 4);
  const blockHeight = Math.max(lineHeight, lines.length * lineHeight);
  const inset = Math.max(28, Math.min(width, height) * 0.08);

  ctx.save();
  ctx.font = `${String(weight || "800")} ${safeFontSize}px ${SYSTEM_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = String(color);
  ctx.globalAlpha = alpha;

  const lineWidths = lines.map((line) => measureLine(ctx, line, spacingPx));
  const blockWidth = lineWidths.length > 0 ? Math.max(...lineWidths) : 0;
  const { left, top } = resolveAnchorPosition(width, height, blockWidth, blockHeight, safeAnchor, inset);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineWidth = lineWidths[index];
    let lineX = left;

    if (safeAlign === "center") {
      lineX += (blockWidth - lineWidth) / 2;
    } else if (safeAlign === "right") {
      lineX += blockWidth - lineWidth;
    }

    drawLine(ctx, line, lineX, top + (index * lineHeight) + offsetY, spacingPx);
  }

  ctx.restore();
}
