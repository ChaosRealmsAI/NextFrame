// ccDesc — italic mono description text, centered.
// Replicates .p1-desc: mono 17px italic, ink-50 color.
// Enter: fade in at delay.

export function ccDesc(t, params = {}, ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const text = params.text || "我数过了。";
  const cx = w * (params.x || 0.5);
  const cy = h * (params.y || 0.64);
  const delay = params.delay || 1.0;
  const enter = 0.5;
  const elapsed = Math.max(0, t - delay);
  const alpha = Math.min(1, elapsed / enter);
  if (alpha <= 0) return;

  const fontSize = Math.round(h * 0.019);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `italic 400 ${fontSize}px Menlo, "Hiragino Sans GB", monospace`;
  ctx.fillStyle = "rgba(245,236,224,0.50)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
  ctx.restore();
}
