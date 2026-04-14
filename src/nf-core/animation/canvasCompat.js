import { clamp01 } from "./shared.js";

const TRANSFORM_RE = /([a-zA-Z0-9]+)\(([^)]+)\)/g;
const INSET_RE = /^inset\((.+)\)$/;
const CIRCLE_RE = /^circle\((.+?) at (.+?) (.+?)\)$/;

function parseUnit(token, size) {
  const value = String(token).trim();
  if (value.endsWith("%")) {
    return Number.parseFloat(value.slice(0, -1)) * 0.01 * size;
  }
  if (value.endsWith("px")) {
    return Number.parseFloat(value.slice(0, -2));
  }
  return Number.parseFloat(value);
}

function applyTransform(ctx, width, height, transform) {
  if (!transform || transform === "none") return;

  for (const match of transform.matchAll(TRANSFORM_RE)) {
    const name = match[1];
    const args = match[2].split(",").map((part) => part.trim()).filter(Boolean);

    if (name === "translateX") {
      ctx.translate(parseUnit(args[0], width), 0);
      continue;
    }
    if (name === "translateY") {
      ctx.translate(0, parseUnit(args[0], height));
      continue;
    }
    if (name === "translate3d" || name === "translate") {
      ctx.translate(parseUnit(args[0], width), parseUnit(args[1] ?? "0", height));
      continue;
    }
    if (name === "scale" || name === "scale3d") {
      const scaleX = Number.parseFloat(args[0]);
      const scaleY = Number.parseFloat(args[1] ?? args[0]);
      ctx.translate(width / 2, height / 2);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-width / 2, -height / 2);
    }
  }
}

function applyClipPath(ctx, width, height, clipPath) {
  if (!clipPath) return;

  const insetMatch = clipPath.match(INSET_RE);
  if (insetMatch) {
    const parts = insetMatch[1].trim().split(/\s+/);
    const [top, right = top, bottom = top, left = right] = parts;
    const topPx = parseUnit(top, height);
    const rightPx = parseUnit(right, width);
    const bottomPx = parseUnit(bottom, height);
    const leftPx = parseUnit(left, width);
    ctx.beginPath();
    ctx.rect(leftPx, topPx, Math.max(0, width - leftPx - rightPx), Math.max(0, height - topPx - bottomPx));
    ctx.clip();
    return;
  }

  const circleMatch = clipPath.match(CIRCLE_RE);
  if (circleMatch) {
    const radius = parseUnit(circleMatch[1], Math.max(width, height));
    const x = parseUnit(circleMatch[2], width);
    const y = parseUnit(circleMatch[3], height);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
  }
}

export function applyCanvasStyle(ctx, width, height, style = {}) {
  if (style.opacity !== undefined) {
    ctx.globalAlpha *= clamp01(style.opacity);
  }
  if (style.filter) {
    ctx.filter = style.filter;
  }
  applyTransform(ctx, width, height, style.transform);
  applyClipPath(ctx, width, height, style.clipPath);
}
