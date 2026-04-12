import { createCanvas } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

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
    const decoded = decodePNGToRGBA(readFileSync(cachePath));
    if (decoded) {
      const imgData = ctx.createImageData(decoded.width, decoded.height);
      imgData.data.set(decoded.data);
      // Scale if needed
      if (decoded.width === width && decoded.height === height) {
        ctx.putImageData(imgData, 0, 0);
      } else {
        const tmp = createCanvas(decoded.width, decoded.height);
        tmp.getContext("2d").putImageData(imgData, 0, 0);
        ctx.drawImage(tmp, 0, 0, width, height);
      }
      return true;
    }
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

// Minimal PNG decoder — extracts RGBA pixel data from a PNG buffer.
// Reuses the same approach as src/views/ascii.js (IHDR + IDAT + inflate + unfilter).
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodePNGToRGBA(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) return null;
  let w = 0, h = 0;
  const idat = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    const data = buf.subarray(off + 8, off + 8 + len);
    off += len + 12;
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (!w || !h) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(w * h * 4);
  let src = 0, dst = 0, prev = null;
  for (let y = 0; y < h; y++) {
    const filter = raw[src++];
    const row = Buffer.from(raw.subarray(src, src + stride));
    src += stride;
    unfilterRow(row, prev, filter, 4);
    row.copy(out, dst);
    prev = row;
    dst += stride;
  }
  return { width: w, height: h, data: out };
}

function unfilterRow(row, prev, filter, bpp) {
  for (let i = 0; i < row.length; i++) {
    const left = i >= bpp ? row[i - bpp] : 0;
    const up = prev ? prev[i] : 0;
    const upLeft = prev && i >= bpp ? prev[i - bpp] : 0;
    if (filter === 1) row[i] = (row[i] + left) & 255;
    else if (filter === 2) row[i] = (row[i] + up) & 255;
    else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) row[i] = (row[i] + paeth(left, up, upLeft)) & 255;
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
