// PNG → ASCII art converter — adapted from POC W3.
// Used for AI to "see" a frame at near-zero cost.

import { createCanvas, loadImage } from "@napi-rs/canvas";

const RAMP = Array.from(" .:-=+*#%@▓█");
const TARGET_WIDTH = 80;
const TARGET_HEIGHT = 24;

/**
 * Convert a PNG buffer to grayscale ASCII art (80x24).
 * @param {Buffer} pngBuffer - PNG image bytes
 * @param {number} [width=80]
 * @param {number} [height=24]
 * @returns {Promise<string>}
 */
export async function pngToAscii(pngBuffer, width = TARGET_WIDTH, height = TARGET_HEIGHT) {
  const image = await loadImage(pngBuffer);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return rasterToAscii(data, width, height);
}

/**
 * Convert raw RGBA pixel data to ASCII art.
 * @param {Uint8ClampedArray|Buffer} data - RGBA bytes
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function rasterToAscii(data, width, height) {
  const lumas = new Float32Array(width * height);
  let minL = 1;
  let maxL = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3] / 255;
    const r = data[i] * a;
    const g = data[i + 1] * a;
    const b = data[i + 2] * a;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lumas[p] = lum;
    if (lum < minL) minL = lum;
    if (lum > maxL) maxL = lum;
  }
  const range = maxL - minL || 1;
  const lines = [];
  for (let y = 0; y < height; y++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const v = (lumas[y * width + x] - minL) / range;
      const idx = Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 1)));
      line += RAMP[idx];
    }
    lines.push(line);
  }
  return lines.join("\n");
}
