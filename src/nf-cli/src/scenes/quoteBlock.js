/**
 * quoteBlock — 引用文字块 + 解释文字
 */
const CJK = '"Hiragino Sans GB", "Heiti TC"';

function easeOutCubic(x) { return 1 - (1 - x) ** 3; }
function tween(t, at, dur) {
  if (t < at) return 0;
  if (t >= at + dur) return 1;
  return easeOutCubic((t - at) / dur);
}

export function quoteBlock(t, params = {}, ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const {
    quote = "",
    explain = "",
    enterAt = 0,
    enterDur = 0.7,
    x: posX = 0.1,
    y: posY = 0.3,
    quoteColor = "#d4b483",
    explainColor = "rgba(245,236,224,0.75)",
    quoteSize = 26,
    explainSize = 18,
  } = params;

  const p = tween(t, enterAt, enterDur);
  if (p <= 0) return;

  ctx.save();
  ctx.globalAlpha = p;
  ctx.translate(0, (1 - p) * 15);

  const bx = W * posX;
  const by = H * posY;

  // quote
  if (quote) {
    ctx.fillStyle = quoteColor;
    ctx.font = `italic ${quoteSize}px "Songti SC", Georgia, ${CJK}, serif`;
    ctx.textAlign = "left";
    const lines = quote.split("\\n");
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx, by + i * (quoteSize + 10));
    }
  }

  // explain
  if (explain) {
    ctx.fillStyle = explainColor;
    ctx.font = `${explainSize}px ${CJK}, sans-serif`;
    const quoteLines = quote ? quote.split("\\n").length : 0;
    const ey = by + quoteLines * (quoteSize + 10) + 16;
    const explainLines = explain.split("\\n");
    for (let i = 0; i < explainLines.length; i++) {
      ctx.fillText(explainLines[i], bx, ey + i * (explainSize + 8));
    }
  }

  ctx.restore();
}

export const META = {
  id: "quoteBlock",
  name: "quoteBlock",
  category: "Typography",
  description: "Italic quote with explanation text below",
  params: {
    quote: { type: "string", default: "" },
    explain: { type: "string", default: "" },
    enterAt: { type: "number", default: 0 },
    quoteColor: { type: "color", default: "#d4b483" },
  },
};
