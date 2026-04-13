// _png-decode.js — shared PNG to RGBA decoder for scene helpers.
// Supports colorType 2 (RGB) and 6 (RGBA). Used by _browser-scenes.js
// and videoWindow.js to load cached screenshots synchronously.

import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Decode a PNG file to { width, height, data: Uint8Array(RGBA) }. Returns null on failure. */
export function decodePNGFile(path) {
  if (!existsSync(path)) return null;
  return decodePNGBuffer(readFileSync(path));
}

/** Decode a PNG buffer to { width, height, data: Uint8Array(RGBA) }. Returns null on failure. */
export function decodePNGBuffer(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  let w = 0, h = 0, ct = 6;
  const idat = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    const data = buf.subarray(off + 8, off + 8 + len);
    off += len + 12;
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (!w || !h) return null;
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const ss = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let src = 0, prev = null;
  for (let y = 0; y < h; y++) {
    const f = raw[src++];
    const row = Buffer.from(raw.subarray(src, src + ss));
    src += ss;
    unfilterRow(row, prev, f, bpp);
    for (let x = 0; x < w; x++) {
      const si = x * bpp, di = (y * w + x) * 4;
      out[di] = row[si];
      out[di + 1] = row[si + (bpp > 1 ? 1 : 0)];
      out[di + 2] = row[si + (bpp > 2 ? 2 : 0)];
      out[di + 3] = bpp === 4 ? row[si + 3] : 255;
    }
    prev = row;
  }
  return { width: w, height: h, data: out };
}

function unfilterRow(row, prev, f, bpp) {
  for (let i = 0; i < row.length; i++) {
    const l = i >= bpp ? row[i - bpp] : 0;
    const u = prev ? prev[i] : 0;
    const ul = prev && i >= bpp ? prev[i - bpp] : 0;
    if (f === 1) row[i] = (row[i] + l) & 255;
    else if (f === 2) row[i] = (row[i] + u) & 255;
    else if (f === 3) row[i] = (row[i] + Math.floor((l + u) / 2)) & 255;
    else if (f === 4) {
      const p = l + u - ul;
      const pa = Math.abs(p - l), pb = Math.abs(p - u), pc = Math.abs(p - ul);
      row[i] = (row[i] + (pa <= pb && pa <= pc ? l : pb <= pc ? u : ul)) & 255;
    }
  }
}
