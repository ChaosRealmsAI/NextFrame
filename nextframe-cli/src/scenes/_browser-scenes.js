import { Image } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CACHE_DIRS = Object.freeze({
  htmlSlide: "/tmp/nextframe-html-cache",
  svgOverlay: "/tmp/nextframe-svg-cache",
  markdownSlide: "/tmp/nextframe-md-cache",
  lottieAnim: "/tmp/nextframe-lottie-cache",
});

const FALLBACK_BG = "#1a1510";
const FALLBACK_INK = "#f5ece0";
const FALLBACK_ACCENT = "#da7756";
const FALLBACK_MUTED = "#d4b483";

export function cachePathForScene(sceneId, width, height, params = {}, t = 0) {
  const cacheDir = CACHE_DIRS[sceneId];
  if (!cacheDir) throw new Error(`unknown browser scene "${sceneId}"`);
  const key = cacheKeyForScene(sceneId, width, height, params, t);
  return join(cacheDir, `${key}.png`);
}

export function cacheKeyForScene(sceneId, width, height, params = {}, t = 0) {
  const payload = browserScenePayload(sceneId, params, t);
  return createHash("sha256")
    .update(JSON.stringify({ sceneId, width, height, payload }))
    .digest("hex")
    .slice(0, 16);
}

export function resolveLottieFrame(frame, t = 0) {
  if (Number.isFinite(Number(frame))) {
    return Math.max(0, Math.round(Number(frame)));
  }
  return Math.max(0, Math.round(Number(t) * 30));
}

export function drawBrowserScene(ctx, sceneId, params, fallback) {
  const width = ctx?.canvas?.width || 1920;
  const height = ctx?.canvas?.height || 1080;
  const cachePath = cachePathForScene(sceneId, width, height, params, fallback.t || 0);
  if (existsSync(cachePath)) {
    const image = new Image();
    image.src = readFileSync(cachePath);
    ctx.drawImage(image, 0, 0, width, height);
    return true;
  }
  drawCacheFallback(ctx, width, height, fallback);
  return false;
}

export function drawCacheFallback(ctx, width, height, fallback) {
  const title = String(fallback?.title || "Browser scene not cached");
  const lines = Array.isArray(fallback?.lines) ? fallback.lines.map(String) : [];
  const note = fallback?.note ? String(fallback.note) : "";

  ctx.save();
  ctx.fillStyle = FALLBACK_BG;
  ctx.fillRect(0, 0, width, height);

  const inset = Math.max(36, Math.round(Math.min(width, height) * 0.08));
  ctx.strokeStyle = "rgba(218, 119, 86, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, width - (inset * 2), height - (inset * 2));

  ctx.fillStyle = FALLBACK_ACCENT;
  ctx.font = `700 ${Math.max(28, Math.round(height * 0.04))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, width / 2, height * 0.42);

  ctx.fillStyle = FALLBACK_INK;
  ctx.font = `500 ${Math.max(18, Math.round(height * 0.024))}px sans-serif`;
  for (const [index, line] of lines.entries()) {
    ctx.fillText(line, width / 2, height * 0.52 + (index * height * 0.045));
  }

  if (note) {
    ctx.fillStyle = FALLBACK_MUTED;
    ctx.font = `400 ${Math.max(15, Math.round(height * 0.018))}px sans-serif`;
    wrapCanvasText(ctx, note, width / 2, height * 0.72, width - (inset * 2), height * 0.032);
  }
  ctx.restore();
}

export function wrapCanvasText(ctx, text, centerX, startY, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return;
  const lines = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  for (const [index, line] of lines.entries()) {
    ctx.fillText(line, centerX, startY + (index * lineHeight));
  }
}

function browserScenePayload(sceneId, params, t) {
  if (sceneId === "svgOverlay") {
    return { svg: String(params?.svg || "<svg></svg>") };
  }
  if (sceneId === "markdownSlide") {
    return {
      md: String(params?.md || "# Hello"),
      theme: String(params?.theme || "anthropic-warm"),
    };
  }
  if (sceneId === "lottieAnim") {
    return {
      src: String(params?.src || ""),
      frame: resolveLottieFrame(params?.frame, t),
    };
  }
  return { html: String(params?.html || params?.src || "") };
}
