import { loadCachedFrame, normalizeSourceFps, quantizeVideoTime } from "./_video-cache.js";

const FALLBACK_BG = "#1a1510";
const FALLBACK_FG = "#da7756";

function drawFallback(ctx, width, height, src, qt) {
  ctx.fillStyle = FALLBACK_BG;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = FALLBACK_FG;
  ctx.font = "700 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`[video not cached: ${src} @ ${qt.toFixed(2)}s]`, width / 2, height / 2);
}

export function videoClip(t, params = {}, ctx) {
  const width = ctx?.canvas?.width || 1;
  const height = ctx?.canvas?.height || 1;
  const src = typeof params.src === "string" ? params.src : "";
  const fps = normalizeSourceFps(params.fps);
  const offset = Number(params.offset) || 0;
  const videoT = offset + (Number(t) || 0);
  const qt = quantizeVideoTime(videoT, fps);
  const image = loadCachedFrame(src, qt, width, height);

  if (!image) {
    drawFallback(ctx, width, height, src, qt);
    return;
  }

  ctx.drawImage(image, 0, 0, width, height);
}
