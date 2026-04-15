// PNG → ASCII art converter — adapted from POC W3.
// Used for AI to "see" a frame at near-zero cost.

import { inflateSync } from "node:zlib";

const RAMP = Array.from(" .:-=+*#%@▓█");
const TARGET_WIDTH = 80;
const TARGET_HEIGHT = 24;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Convert a PNG buffer to grayscale ASCII art (80x24).
 * @param {Buffer} pngBuffer - PNG image bytes
 * @param {number} [width=80]
 * @param {number} [height=24]
 * @returns {Promise<string>}
 */
export async function pngToAscii(pngBuffer: Buffer | Uint8Array, width = TARGET_WIDTH, height = TARGET_HEIGHT) {
  const decoded = decodePNG(pngBuffer);
  const scaled = scaleRaster(decoded.data, decoded.width, decoded.height, width, height);
  return rasterToAscii(scaled, width, height);
}

/**
 * Convert raw RGBA pixel data to ASCII art.
 * @param {Uint8ClampedArray|Buffer} data - RGBA bytes
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function rasterToAscii(data: Buffer | Uint8Array | Uint8ClampedArray, width: number, height: number): string {
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
  const lines: string[] = [];
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

function decodePNG(pngBuffer: Buffer | Uint8Array) {
  const bytes = Buffer.isBuffer(pngBuffer) ? pngBuffer : Buffer.from(pngBuffer);
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("png signature mismatch");
  }
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  for (let offset = PNG_SIGNATURE.length; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error("unsupported png format");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = Buffer.alloc(width * height * 4);
  let src = 0;
  let dst = 0;
  let prev: Buffer | null = null;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = Buffer.from(raw.subarray(src, src + stride));
    src += stride;
    unfilterRow(row, prev, filter, 4);
    row.copy(out, dst);
    prev = row;
    dst += stride;
  }
  return { width, height, data: out };
}

function unfilterRow(row: Buffer, prev: Buffer | null, filter: number, bpp: number): void {
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

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function scaleRaster(data: Buffer, srcWidth: number, srcHeight: number, outWidth: number, outHeight: number): Buffer {
  const out = Buffer.alloc(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    const srcY = Math.min(srcHeight - 1, Math.floor((y / outHeight) * srcHeight));
    for (let x = 0; x < outWidth; x++) {
      const srcX = Math.min(srcWidth - 1, Math.floor((x / outWidth) * srcWidth));
      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (y * outWidth + x) * 4;
      out[dstIdx] = data[srcIdx];
      out[dstIdx + 1] = data[srcIdx + 1];
      out[dstIdx + 2] = data[srcIdx + 2];
      out[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return out;
}
