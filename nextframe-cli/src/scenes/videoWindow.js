// videoWindow — draws a cached video frame inside a macOS-style window chrome.
// Reads from the same cache as videoClip but renders at a sub-region with
// titlebar, shadow, and rounded corners.

import { createCanvas } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const CACHE_DIR = "/tmp/nextframe-video-cache";

function frameKey(src, t, w, h) {
  return createHash("sha256").update(`${src}:${t.toFixed(3)}:${w}x${h}`).digest("hex").slice(0, 16);
}

export function videoWindow(t, params = {}, ctx) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const src = params.src || "";
  const videoT = (params.offset || 0) + t;
  const fps = params.fps || 30;
  const qt = Math.round(videoT * fps) / fps;

  // Window geometry
  const insetX = params.insetX || 0.12;
  const insetY = params.insetY || 0.10;
  const wx = Math.round(cw * insetX);
  const wy = Math.round(ch * insetY);
  const ww = cw - wx * 2;
  const titleH = Math.round(ch * 0.04);
  const wh = ch - wy * 2;
  const contentH = wh - titleH;
  const radius = 12;

  // Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, wx, wy, ww, wh, radius);
  ctx.fillStyle = "#1e2227";
  ctx.fill();
  ctx.restore();

  // Titlebar
  ctx.fillStyle = "#1e2227";
  roundRectTop(ctx, wx, wy, ww, titleH, radius);
  ctx.fill();

  // Traffic lights
  const dotY = wy + titleH / 2;
  const dotR = Math.max(5, titleH * 0.18);
  ctx.fillStyle = "#ff5f57"; ctx.beginPath(); ctx.arc(wx + 20, dotY, dotR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#febc2e"; ctx.beginPath(); ctx.arc(wx + 40, dotY, dotR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#28c840"; ctx.beginPath(); ctx.arc(wx + 60, dotY, dotR, 0, Math.PI * 2); ctx.fill();

  // Window title
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `500 ${Math.round(titleH * 0.45)}px Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const title = params.title || src.split("/").pop() || "video.mp4";
  ctx.fillText(title, wx + ww / 2, dotY);

  // Titlebar separator
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wx, wy + titleH);
  ctx.lineTo(wx + ww, wy + titleH);
  ctx.stroke();

  // Video content area
  const vx = wx;
  const vy = wy + titleH;
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(vx, vy, ww, contentH);

  // Load cached video frame
  const key = frameKey(src, qt, cw, ch);
  const path = join(CACHE_DIR, `${key}.png`);
  if (existsSync(path)) {
    const decoded = decodePNG(readFileSync(path));
    if (decoded) {
      const imgData = ctx.createImageData(decoded.width, decoded.height);
      imgData.data.set(decoded.data);
      const tmp = createCanvas(decoded.width, decoded.height);
      tmp.getContext("2d").putImageData(imgData, 0, 0);
      // Draw scaled into window content area
      ctx.save();
      ctx.beginPath();
      ctx.rect(vx, vy, ww, contentH);
      ctx.clip();
      ctx.drawImage(tmp, vx, vy, ww, contentH);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = "#da7756";
    ctx.font = "700 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`[video: ${qt.toFixed(1)}s]`, vx + ww / 2, vy + contentH / 2);
  }

  // Bottom rounded corners
  roundRectBottom(ctx, wx, wy + wh - 2, ww, 2, radius);
  ctx.fillStyle = "#1e2227";
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function roundRectTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function roundRectBottom(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.closePath();
}

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) return null;
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
    uf(row, prev, f, bpp);
    for (let x = 0; x < w; x++) {
      const si = x * bpp, di = (y * w + x) * 4;
      out[di] = row[si]; out[di+1] = row[si + (bpp > 1 ? 1 : 0)]; out[di+2] = row[si + (bpp > 2 ? 2 : 0)]; out[di+3] = bpp === 4 ? row[si+3] : 255;
    }
    prev = row;
  }
  return { width: w, height: h, data: out };
}
function uf(row, prev, f, bpp) {
  for (let i = 0; i < row.length; i++) {
    const l = i >= bpp ? row[i - bpp] : 0;
    const u = prev ? prev[i] : 0;
    const ul = prev && i >= bpp ? prev[i - bpp] : 0;
    if (f === 1) row[i] = (row[i] + l) & 255;
    else if (f === 2) row[i] = (row[i] + u) & 255;
    else if (f === 3) row[i] = (row[i] + Math.floor((l + u) / 2)) & 255;
    else if (f === 4) { const p = l + u - ul; const pa = Math.abs(p-l), pb = Math.abs(p-u), pc = Math.abs(p-ul); row[i] = (row[i] + (pa<=pb&&pa<=pc?l:pb<=pc?u:ul)) & 255; }
  }
}
