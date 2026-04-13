// ccFrame — anthropic-warm slide shell.
// Renders: warm brown bg + radial terracotta glow + top/bottom rules +
// episode tag + brand watermark + progress bar.

export function ccFrame(t, params = {}, ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Base
  ctx.fillStyle = "#1a1510";
  ctx.fillRect(0, 0, w, h);

  // Radial warmth (upper-right terracotta leak)
  const gx = w * 0.78, gy = h * 0.18;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.7);
  g.addColorStop(0, "rgba(218,119,86,0.14)");
  g.addColorStop(0.5, "rgba(218,119,86,0.04)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Rules
  ctx.strokeStyle = "rgba(245,236,224,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.085);
  ctx.lineTo(w * 0.94, h * 0.085);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.915);
  ctx.lineTo(w * 0.94, h * 0.915);
  ctx.stroke();

  // Episode tag (top-left)
  const tagSize = Math.round(h * 0.015);
  ctx.font = `700 ${tagSize}px "Menlo", "Hiragino Sans GB", monospace`;
  ctx.fillStyle = "rgba(245,236,224,0.50)";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(params.tag || "OPC · 王宇轩", w * 0.06, h * 0.05);

  // Series title (top-center)
  ctx.font = `700 ${tagSize}px "Menlo", "Hiragino Sans GB", monospace`;
  ctx.fillStyle = "#da7756";
  ctx.textAlign = "center";
  const seriesText = params.series || "《深入浅出 Claude Code 源代码》";
  ctx.fillText(seriesText, w * 0.38, h * 0.05);

  // Subtitle after series
  ctx.fillStyle = "rgba(245,236,224,0.50)";
  ctx.fillText(params.subtitle || "以终为始：从最终提示词倒推逻辑", w * 0.62, h * 0.05);

  // E01 watermark (top-right, large)
  const wmSize = Math.round(h * 0.11);
  ctx.font = `900 ${wmSize}px Georgia, "Hiragino Sans GB", serif`;
  ctx.fillStyle = "rgba(218,119,86,0.18)";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(params.ep || "E01", w * 0.95, h * 0.02);

  // Progress bar
  const dur = params.duration || 72.42;
  const prog = Math.min(1, Math.max(0, t / dur));
  ctx.strokeStyle = "#da7756";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.945);
  ctx.lineTo(w * 0.06 + w * 0.88 * prog, h * 0.945);
  ctx.stroke();
  // Progress bg
  ctx.strokeStyle = "rgba(245,236,224,0.06)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.06 + w * 0.88 * prog, h * 0.945);
  ctx.lineTo(w * 0.94, h * 0.945);
  ctx.stroke();
}
