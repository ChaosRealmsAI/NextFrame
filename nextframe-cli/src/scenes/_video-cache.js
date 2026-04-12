import { Image } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export const CACHE_DIR = "/tmp/nextframe-video-cache";
const CACHE_ENV_KEY = "NEXTFRAME_VIDEO_CACHE_DIR";

const FRAME_IMAGE_CACHE = new Map();

export function normalizeSourceFps(value) {
  const fps = Number(value);
  return Number.isFinite(fps) && fps > 0 ? fps : 30;
}

export function quantizeVideoTime(t, fps = 30) {
  const safeT = Math.max(0, Number(t) || 0);
  const safeFps = normalizeSourceFps(fps);
  return Math.round(safeT * safeFps) / safeFps;
}

export function frameKey(src, t, width, height) {
  return createHash("sha256")
    .update(`${String(src || "")}:${t.toFixed(3)}:${width}x${height}`)
    .digest("hex")
    .slice(0, 16);
}

export function ensureVideoCacheDir(cacheDir) {
  mkdirSync(resolveVideoCacheDir(cacheDir), { recursive: true });
}

export function cachedFramePath(src, t, width, height, cacheDir) {
  const resolvedCacheDir = resolveVideoCacheDir(cacheDir);
  ensureVideoCacheDir(resolvedCacheDir);
  return join(resolvedCacheDir, `${frameKey(src, t, width, height)}.png`);
}

export function resolveVideoInputPath(src, baseDir = process.cwd()) {
  if (typeof src !== "string" || src.trim() === "") return "";
  return isAbsolute(src) ? src : resolve(baseDir, src);
}

export function loadCachedFrame(src, t, width, height, cacheDir) {
  const path = cachedFramePath(src, t, width, height, cacheDir);
  if (!existsSync(path)) return null;
  if (FRAME_IMAGE_CACHE.has(path)) return FRAME_IMAGE_CACHE.get(path);
  const image = new Image();
  image.src = readFileSync(path);
  FRAME_IMAGE_CACHE.set(path, image);
  return image;
}

function resolveVideoCacheDir(cacheDir) {
  return cacheDir || process.env[CACHE_ENV_KEY] || CACHE_DIR;
}
