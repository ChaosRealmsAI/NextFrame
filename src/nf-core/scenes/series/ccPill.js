// ccPill — monospace label pill with border.
// Replicates .confidential-label: mono 15px 700, letter-spacing .18em,
// color --ac, border --ac-25, bg --ac-10, radius 4px.
// Enter: fade + slide up over 0.6s.

export function ccPill(t, params = {}, ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const text = params.text || "ANTHROPIC CONFIDENTIAL · LEAKED";
  const cx = w * (params.x || 0.5);
  const cy = h * (params.y || 0.28);
  const enter = 0.6;
  const alpha = Math.min(1, t / enter);
  const offsetY = (1 - alpha) * h * -0.012;

  const fontSize = Math.round(h * 0.016);
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.font = `700 ${fontSize}px Menlo, "Hiragino Sans GB", monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const metrics = ctx.measureText(text);
  const padX = fontSize * 1.2;
  const padY = fontSize * 0.45;
  const boxW = metrics.width + padX * 2;
  const boxH = fontSize + padY * 2;
  const bx = cx - boxW / 2;
  const by = cy - boxH / 2 + offsetY;

  // Background pill
  ctx.fillStyle = "rgba(218,119,86,0.10)";
  roundRect(ctx, bx, by, boxW, boxH, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(218,119,86,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Text
  ctx.fillStyle = "#da7756";
  ctx.fillText(text, cx, cy + offsetY);

  ctx.restore();
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
