/**
 * iconCardGrid — horizontal grid of N icon cards
 * Reusable for: tool showcases, feature lists, and feature comparisons
 */
const CJK = '"Hiragino Sans GB", "Heiti TC"';
function f(w, s, fam) {
  if (fam === "m") return `${w} ${s}px Menlo, ${CJK}, monospace`;
  return `${w} ${s}px ${CJK}, sans-serif`;
}

function easeOutBack(x) { const c = 1.7; return 1 + (c + 1) * ((x - 1) ** 3) + c * ((x - 1) ** 2); }
function tween(t, at, dur) {
  if (t < at) return 0;
  if (t >= at + dur) return 1;
  return easeOutBack((t - at) / dur);
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

export function iconCardGrid(t, params = {}, ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const {
    cards = [],
    staggerStart = 0,
    staggerGap = 0.15,
    cardHeight = 110,
    y: posY = 0.15,
    padX = 0.06,
  } = params;

  if (!cards.length) return;

  const px = W * padX;
  const gap = 16;
  const cardW = (W - px * 2 - gap * (cards.length - 1)) / cards.length;
  const cy = H * posY;

  const defaultColors = ["#7ec699", "#8ab4cc", "#da7756", "#d4b483", "#7ec699", "#8ab4cc"];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const color = card.color || defaultColors[i % defaultColors.length];
    const p = tween(t, staggerStart + i * staggerGap, 0.3);
    if (p <= 0) continue;

    const cx2 = px + i * (cardW + gap);
    const scale = 0.7 + 0.3 * p;

    ctx.save();
    ctx.globalAlpha = p;
    const centerX = cx2 + cardW / 2;
    const centerY = cy + cardHeight / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);

    // card bg
    roundRect(ctx, cx2, cy, cardW, cardHeight, 12);
    ctx.fillStyle = "#1a1816"; ctx.fill();
    ctx.strokeStyle = "rgba(245,236,224,0.08)"; ctx.lineWidth = 1; ctx.stroke();

    // top accent
    ctx.fillStyle = color;
    ctx.fillRect(cx2, cy, cardW, 2);

    // icon text (emoji or symbol)
    ctx.fillStyle = color; ctx.font = f("bold", 28, "m"); ctx.textAlign = "center";
    ctx.fillText(card.icon || "◆", cx2 + cardW / 2, cy + 40);

    // name
    ctx.fillStyle = "#f5ece0"; ctx.font = f("bold", 16, "m");
    ctx.fillText(card.name || "", cx2 + cardW / 2, cy + 70);

    // desc
    ctx.fillStyle = "rgba(245,236,224,0.5)"; ctx.font = f("", 14, "s");
    ctx.fillText(card.desc || "", cx2 + cardW / 2, cy + 90);

    ctx.restore();
  }
}

export const META = {
  id: "iconCardGrid",
  name: "iconCardGrid",
  category: "Overlays",
  description: "N icon cards in a horizontal grid with stagger animation",
  params: {
    cards: { type: "array", default: [] },
    staggerStart: { type: "number", default: 0 },
    staggerGap: { type: "number", default: 0.15 },
    cardHeight: { type: "number", default: 110 },
    y: { type: "number", default: 0.15 },
  },
};
