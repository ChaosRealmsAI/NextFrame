/**
 * codeBlock — JSON/代码块带语法高亮 + macOS 窗口 chrome
 * 可复用于：任何代码展示
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

const SYNTAX_COLORS = {
  key: "#ff7b72",
  string: "#7ee787",
  number: "#ffa657",
  bracket: "rgba(245,236,224,0.45)",
  comment: "rgba(245,236,224,0.28)",
  plain: "#f5ece0",
};

export function codeBlock(t, params = {}, ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const {
    enterAt = 0,
    enterDur = 0.7,
    x: posX = 0.06,
    y: posY = 0.35,
    w: relW = 0.88,
    h: relH = 0.55,
    title = "code",
    badge = "JSON",
    lines = [],
    note = "",
    noteAt = -1,
    noteDur = 0.5,
  } = params;

  const p = tween(t, enterAt, enterDur);
  if (p <= 0) return;

  const bx = W * posX;
  const by = H * posY + (1 - p) * 20;
  const bw = W * relW;
  const bh = H * relH;

  ctx.save();
  ctx.globalAlpha = p;

  // window
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.fillStyle = "#111111"; ctx.fill();
  ctx.strokeStyle = "rgba(245,236,224,0.08)"; ctx.lineWidth = 1; ctx.stroke();

  // title bar
  ctx.fillStyle = "#1a1a1a";
  roundRect(ctx, bx, by, bw, 36, 14); ctx.fill();
  ctx.fillRect(bx, by + 20, bw, 16);

  // dots
  const dotY = by + 18;
  [["#ff5f57", bx + 16], ["#febc2e", bx + 30], ["#28c840", bx + 44]].forEach(([c, dx]) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(dx, dotY, 5, 0, Math.PI * 2); ctx.fill();
  });

  // title text
  ctx.fillStyle = "rgba(245,236,224,0.3)"; ctx.font = `14px Menlo, ${CJK}, monospace`; ctx.textAlign = "center";
  ctx.fillText(title, bx + bw / 2, dotY + 4);

  // badge
  if (badge) {
    ctx.fillStyle = "rgba(218,119,86,0.1)"; ctx.strokeStyle = "rgba(218,119,86,0.25)";
    const bw2 = ctx.measureText(badge).width + 20;
    roundRect(ctx, bx + bw - bw2 - 16, dotY - 12, bw2, 24, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#da7756"; ctx.font = `bold 14px Menlo, ${CJK}, monospace`; ctx.textAlign = "center";
    ctx.fillText(badge, bx + bw - bw2 / 2 - 16, dotY + 4);
  }

  // code lines
  ctx.textAlign = "left"; ctx.font = `16px Menlo, ${CJK}, monospace`;
  let lineY = by + 56;
  const lh = 26;
  for (const line of lines) {
    if (typeof line === "string") {
      ctx.fillStyle = SYNTAX_COLORS.plain;
      ctx.fillText(line, bx + 28, lineY);
    } else if (Array.isArray(line)) {
      let cx = bx + 28;
      for (let i = 0; i < line.length; i += 2) {
        const text = line[i] || "";
        const type = line[i + 1] || "plain";
        ctx.fillStyle = SYNTAX_COLORS[type] || SYNTAX_COLORS.plain;
        ctx.fillText(text, cx, lineY);
        cx += ctx.measureText(text).width;
      }
    }
    lineY += lh;
  }

  // note
  if (note && noteAt >= 0) {
    const np = tween(t, noteAt, noteDur);
    if (np > 0) {
      ctx.globalAlpha = p * np;
      ctx.fillStyle = "rgba(245,236,224,0.03)";
      ctx.fillRect(bx, by + bh - 40, bw, 40);
      ctx.fillStyle = "rgba(245,236,224,0.75)"; ctx.font = `15px ${CJK}, sans-serif`; ctx.textAlign = "left";
      ctx.fillText(note, bx + 28, by + bh - 14);
    }
  }

  ctx.restore();
}

export const META = {
  id: "codeBlock",
  name: "codeBlock",
  category: "Overlays",
  description: "Code block with syntax highlighting and macOS window chrome",
  params: {
    lines: { type: "array", default: [] },
    title: { type: "string", default: "code" },
    badge: { type: "string", default: "JSON" },
    enterAt: { type: "number", default: 0 },
    note: { type: "string", default: "" },
  },
};
