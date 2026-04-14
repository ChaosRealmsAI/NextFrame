/**
 * horizontalBars — horizontal bar chart with per-bar stagger animation
 * Reusable for: comparison, growth, and stats presentation
 */
const CJK = '"Hiragino Sans GB", "Heiti TC"';

function easeOutCubic(x) { return 1 - (1 - x) ** 3; }
function tween(t, at, dur) {
  if (t < at) return 0;
  if (t >= at + dur) return 1;
  return easeOutCubic((t - at) / dur);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function horizontalBars(t, params = {}, ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const {
    bars = [],
    enterAt = 0,
    staggerGap = 1.0,
    y: posY = 0.06,
    padX = 0.06,
    barHeight = 36,
    barGap = 52,
    labelWidth = 140,
  } = params;

  if (!bars.length) return;

  const px = W * padX;
  const trackW = W - px * 2 - labelWidth;
  const startY = H * posY;

  const mainP = tween(t, enterAt, 0.6);
  ctx.save();
  ctx.globalAlpha = mainP;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const bp = tween(t, enterAt + i * staggerGap, 0.6);
    if (bp <= 0) continue;

    ctx.save();
    ctx.globalAlpha = mainP * bp;
    const by = startY + i * barGap;

    // label
    ctx.fillStyle = bar.color || "#da7756";
    ctx.font = `bold 16px Menlo, ${CJK}, monospace`;
    ctx.textAlign = "right";
    ctx.fillText(bar.label || "", px + labelWidth - 16, by + barHeight / 2 + 6);

    // track bg
    const tx = px + labelWidth;
    roundRect(ctx, tx, by, trackW, barHeight, 8);
    ctx.fillStyle = "#1a1816"; ctx.fill();

    // fill
    const fillW = trackW * (bar.width || 0.5) * bp;
    roundRect(ctx, tx, by, fillW, barHeight, 8);
    ctx.fillStyle = bar.fillColor || "rgba(218,119,86,0.25)"; ctx.fill();

    if (bar.dashed) {
      ctx.strokeStyle = bar.dashColor || "rgba(212,180,131,0.3)";
      ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      roundRect(ctx, tx, by, fillW, barHeight, 8); ctx.stroke();
      ctx.setLineDash([]);
    }

    // value
    ctx.fillStyle = bar.color || "#da7756";
    ctx.font = `bold 14px Menlo, ${CJK}, monospace`;
    ctx.textAlign = "left";
    ctx.fillText(bar.value || "", tx + 14, by + barHeight / 2 + 5);

    // chips
    if (bar.chips && bar.chips.length) {
      let chipX = tx + 50;
      ctx.font = `14px Menlo, ${CJK}, monospace`;
      for (const chip of bar.chips) {
        const cw = ctx.measureText(chip).width + 16;
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        roundRect(ctx, chipX, by + 7, cw, 22, 4); ctx.fill();
        ctx.fillStyle = "rgba(245,236,224,0.5)";
        ctx.fillText(chip, chipX + 8, by + 23);
        chipX += cw + 6;
      }
    }

    ctx.restore();
  }

  ctx.restore();
}

export const META = {
  id: "horizontalBars",
  name: "horizontalBars",
  category: "Data Viz",
  description: "Horizontal bar chart with stagger animation and chips",
  params: {
    bars: { type: "array", default: [] },
    enterAt: { type: "number", default: 0 },
    staggerGap: { type: "number", default: 1.0 },
  },
};
