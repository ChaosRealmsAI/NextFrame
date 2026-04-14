// ccBigNumber — giant serif number + label, centered.
// Replicates .big-number (220px Georgia 900) + .big-number-label (42px Georgia 400).
// Enter animation: scale from 0.85 + fade in over first 0.9s.

export function ccBigNumber(t, params = {}, ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const number = params.number || "87";
  const label = params.label || "类提示词";
  const enter = 0.9;
  const alpha = Math.min(1, t / enter);
  const scale = 0.85 + 0.15 * Math.min(1, t / enter);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(w * 0.5, h * 0.48);
  ctx.scale(scale, scale);

  // Number
  const numSize = Math.round(h * 0.22);
  ctx.font = `900 ${numSize}px Georgia, "Hiragino Sans GB", serif`;
  ctx.fillStyle = "#da7756";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(number, 0, 0);

  // Label below
  const lblSize = Math.round(h * 0.045);
  ctx.font = `400 ${lblSize}px Georgia, "Hiragino Sans GB", serif`;
  ctx.fillStyle = "#f5ece0";
  ctx.textBaseline = "top";
  ctx.fillText(label, 0, numSize * 0.12);

  ctx.restore();
}
