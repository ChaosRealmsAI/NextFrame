// videoWindow — draws a cached video frame inside a macOS-style window chrome.
// Imports only from @napi-rs/canvas and ./_* helpers (arch-2 compliant).

import { createCanvas } from "@napi-rs/canvas";
import { CACHE_DIR, frameKey, quantizeVideoTime } from "../_video-cache.js";
import { decodePNGFile } from "../_png-decode.js";

export function videoWindow(t, params = {}, ctx) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const src = params.src || "";
  const videoT = (params.offset || 0) + t;
  const fps = params.fps || 30;
  const qt = quantizeVideoTime(videoT, fps);

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
  ctx.font = `500 ${Math.round(titleH * 0.45)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(params.title || src.split("/").pop() || "video.mp4", wx + ww / 2, dotY);

  // Separator
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wx, wy + titleH);
  ctx.lineTo(wx + ww, wy + titleH);
  ctx.stroke();

  // Content area
  const vx = wx;
  const vy = wy + titleH;
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(vx, vy, ww, contentH);

  // Load cached video frame
  const key = frameKey(src, qt, cw, ch);
  const path = `${CACHE_DIR}/${key}.png`;
  const decoded = decodePNGFile(path);
  if (decoded) {
    const imgData = ctx.createImageData(decoded.width, decoded.height);
    imgData.data.set(decoded.data);
    const tmp = createCanvas(decoded.width, decoded.height);
    tmp.getContext("2d").putImageData(imgData, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(vx, vy, ww, contentH);
    ctx.clip();
    ctx.drawImage(tmp, vx, vy, ww, contentH);
    ctx.restore();
  } else {
    ctx.fillStyle = "#da7756";
    ctx.font = "700 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`[video: ${qt.toFixed(1)}s]`, vx + ww / 2, vy + contentH / 2);
  }
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
