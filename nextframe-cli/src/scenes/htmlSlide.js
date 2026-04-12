import { drawCachedHtmlSlide } from "./_html-cache.js";

function resolveSize(ctx) {
  return {
    width: ctx?.canvas?.width || ctx?.canvas?.clientWidth || 1,
    height: ctx?.canvas?.height || ctx?.canvas?.clientHeight || 1,
  };
}

function drawMessage(ctx, width, height, message, accent = "#da7756") {
  ctx.fillStyle = "#1a1510";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = accent;
  ctx.font = "700 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, width / 2, height / 2);
}

export function htmlSlide(t, params = {}, ctx) {
  const { width, height } = resolveSize(ctx);
  try {
    if (!drawCachedHtmlSlide(ctx, params.html, width, height)) {
      drawMessage(ctx, width, height, "[HTML not cached - run nextframe bake-html first]");
      return;
    }
  } catch (err) {
    drawMessage(ctx, width, height, `HTML load error: ${err.message}`, "#ff8a66");
  }
}
