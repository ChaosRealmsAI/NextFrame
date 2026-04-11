const ACTION_SAFE_SCALE = 0.95;
const TITLE_SAFE_SCALE = 0.9;

export function drawSafeArea(ctx, width, height) {
  if (!ctx || width <= 0 || height <= 0) {
    return;
  }

  ctx.save();
  ctx.lineWidth = 1;

  strokeGuide(ctx, width, height, ACTION_SAFE_SCALE, "rgba(255, 255, 255, 0.22)");
  strokeGuide(ctx, width, height, TITLE_SAFE_SCALE, "rgba(255, 255, 255, 0.42)");

  ctx.restore();
}

function strokeGuide(ctx, width, height, scale, strokeStyle) {
  const insetX = ((1 - scale) * width) / 2;
  const insetY = ((1 - scale) * height) / 2;

  ctx.strokeStyle = strokeStyle;
  ctx.strokeRect(
    Math.round(insetX) + 0.5,
    Math.round(insetY) + 0.5,
    Math.max(0, Math.round(width - insetX * 2) - 1),
    Math.max(0, Math.round(height - insetY * 2) - 1),
  );
}
