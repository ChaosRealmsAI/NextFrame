// ccNote — note badge with accent dot + text.
// Replicates .p1-note-badge: bg2, rule2 border, dot + mono text.
// Enter: fade in over 0.5s after delay.

export function ccNote(t, params = {}, ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const text = params.text || "以 Claude Code 第一人称讲述";
  const cx = w * (params.x || 0.5);
  const cy = h * (params.y || 0.72);
  const delay = params.delay || 1.5;
  const enter = 0.5;
  const elapsed = Math.max(0, t - delay);
  const alpha = Math.min(1, elapsed / enter);
  if (alpha <= 0) return;

  const fontSize = Math.round(h * 0.017);
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.font = `400 ${fontSize}px Menlo, "Hiragino Sans GB", monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const metrics = ctx.measureText(text);
  const dotR = h * 0.005;
  const gap = fontSize * 0.7;
  const padX = fontSize * 1.3;
  const padY = fontSize * 0.75;
  const contentW = dotR * 2 + gap + metrics.width;
  const boxW = contentW + padX * 2;
  const boxH = fontSize + padY * 2;
  const bx = cx - boxW / 2;
  const by = cy - boxH / 2;

  // Background
  ctx.fillStyle = "#211c15";
  roundRect(ctx, bx, by, boxW, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(245,236,224,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Dot
  const dotX = bx + padX + dotR;
  ctx.fillStyle = "#da7756";
  ctx.beginPath();
  ctx.arc(dotX, cy, dotR, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.fillStyle = "rgba(245,236,224,0.75)";
  ctx.fillText(text, dotX + dotR + gap, cy);

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
