import { Image, ImageData } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

export const HTML_SLIDE_CACHE_DIR = "/tmp/nextframe-html-cache";
export const HTML_SLIDE_DEFAULT_HTML = "<div style='width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font:700 48px sans-serif'>Empty HTML</div>";

const CHROME_CANDIDATES = [
  process.env.NEXTFRAME_CHROME,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
].filter(Boolean);

export function normalizeHtmlSlide(html) {
  return typeof html === "string" && html.trim().length > 0 ? html : HTML_SLIDE_DEFAULT_HTML;
}

export function htmlSlideCacheKey(html, width, height) {
  return createHash("sha256").update(`${width}x${height}:${normalizeHtmlSlide(html)}`).digest("hex").slice(0, 16);
}

export function htmlSlideCachePath(html, width, height) {
  return join(HTML_SLIDE_CACHE_DIR, `${htmlSlideCacheKey(html, width, height)}.png`);
}

export function ensureHtmlSlideCacheDir() {
  mkdirSync(HTML_SLIDE_CACHE_DIR, { recursive: true });
}

export function readCachedHtmlSlideImage(html, width, height) {
  const path = htmlSlideCachePath(html, width, height);
  if (!existsSync(path)) {
    return null;
  }
  const image = new Image();
  image.src = readFileSync(path);
  return image;
}

export function drawCachedHtmlSlide(ctx, html, width, height) {
  const path = htmlSlideCachePath(html, width, height);
  if (!existsSync(path)) {
    return false;
  }
  const png = PNG.sync.read(readFileSync(path));
  const data = png.data instanceof Uint8ClampedArray ? png.data : new Uint8ClampedArray(png.data);
  ctx.putImageData(new ImageData(data, png.width, png.height), 0, 0);
  return true;
}

export function resolveChromeExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function wrapHtmlSlideDocument(html, width, height) {
  const markup = normalizeHtmlSlide(html);
  if (/<html[\s>]/i.test(markup)) {
    return markup;
  }
  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    "<meta charset='utf-8' />",
    `<meta name='viewport' content='width=${width}, initial-scale=1' />`,
    "<style>",
    `html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }`,
    "#nextframe-root { width: 100%; height: 100%; overflow: hidden; }",
    "</style>",
    "</head>",
    "<body>",
    `<div id='nextframe-root'>${markup}</div>`,
    "</body>",
    "</html>",
  ].join("");
}
