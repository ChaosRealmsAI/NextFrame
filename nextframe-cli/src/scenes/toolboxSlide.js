/**
 * toolboxSlide — 一比一复刻 09-dim-tools-v2.html
 * P1 (0-12s): 工具箱标题 + 6 个工具卡片 + JSON Schema 代码块
 * P2 (12-32s): 增长条形图 + 瑞士军刀 + 100+ 大数字
 */

// ─── 色板（匹配 theme.css） ───
const INK = "#f5ece0";
const INK50 = "rgba(245,236,224,0.5)";
const INK75 = "rgba(245,236,224,0.75)";
const BG = "#0e0c0a";
const BG2 = "#1a1816";
const RULE2 = "rgba(245,236,224,0.08)";
const AC = "#da7756";
const AC10 = "rgba(218,119,86,0.1)";
const AC25 = "rgba(218,119,86,0.25)";
const GREEN = "#7ec699";
const BLUE = "#8ab4cc";
const GOLD = "#d4b483";
const RED = "#e06c75";

// ─── Easing + Tween ───
function easeOutCubic(x) { return 1 - (1 - x) ** 3; }
function easeOutBack(x) { const c = 1.7; return 1 + (c + 1) * ((x - 1) ** 3) + c * ((x - 1) ** 2); }

function tween(t, startAt, dur, easeFn) {
  if (t < startAt) return 0;
  if (t >= startAt + dur) return 1;
  const raw = (t - startAt) / dur;
  return easeFn ? easeFn(raw) : raw;
}

// ─── 绘制工具 ───
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCard(ctx, x, y, w, h, { name, desc, color, iconFn, progress }) {
  const alpha = progress;
  const scale = 0.7 + 0.3 * progress;
  ctx.save();
  ctx.globalAlpha = alpha;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // card bg
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = BG2;
  ctx.fill();
  ctx.strokeStyle = RULE2;
  ctx.lineWidth = 1;
  ctx.stroke();

  // top accent line
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 2);

  // icon
  if (iconFn) iconFn(ctx, x + w / 2, y + 40, color);

  // name
  ctx.fillStyle = INK;
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillText(name, x + w / 2, y + 75);

  // desc
  ctx.fillStyle = INK50;
  ctx.font = "14px sans-serif";
  ctx.fillText(desc, x + w / 2, y + 95);

  ctx.restore();
}

// ─── 图标绘制函数 ───
function iconBash(ctx, cx, cy, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  roundRect(ctx, cx - 18, cy - 14, 36, 28, 4); ctx.stroke();
  ctx.fillStyle = color; ctx.font = "bold 16px monospace";
  ctx.textAlign = "center"; ctx.fillText("$_", cx, cy + 6);
}
function iconRead(ctx, cx, cy, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 12, cy - 16); ctx.lineTo(cx + 12, cy - 16);
  ctx.lineTo(cx + 8, cy + 16); ctx.lineTo(cx - 8, cy + 16); ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(cx - 8 + i, cy - 8 + i * 6); ctx.lineTo(cx + 8 - i, cy - 8 + i * 6); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function iconEdit(ctx, cx, cy, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx - 14, cy + 14); ctx.lineTo(cx + 10, cy - 10); ctx.stroke();
  ctx.fillStyle = color; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(cx + 10, cy - 10); ctx.lineTo(cx + 14, cy - 14); ctx.lineTo(cx + 18, cy - 10); ctx.lineTo(cx + 14, cy - 6); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 16, cy + 16); ctx.lineTo(cx - 6, cy + 16); ctx.stroke();
}
function iconGrep(ctx, cx, cy, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx + 7, cy + 7); ctx.lineTo(cx + 16, cy + 16); ctx.stroke();
  ctx.lineCap = "butt";
}
function iconAgent(ctx, cx, cy, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy - 8, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 14, cy + 18); ctx.quadraticCurveTo(cx, cy + 2, cx + 14, cy + 18); ctx.stroke();
}
function iconSkill(ctx, cx, cy, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  roundRect(ctx, cx - 16, cy - 16, 32, 32, 6); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx - 2, cy + 6); ctx.lineTo(cx + 8, cy - 6); ctx.stroke();
  ctx.lineCap = "butt"; ctx.lineJoin = "miter";
}

// ─── JSON Schema 代码块 ───
function drawSchemaBlock(ctx, x, y, w, h, progress) {
  ctx.save();
  ctx.globalAlpha = progress;
  const yOff = (1 - progress) * 20;

  // window chrome
  roundRect(ctx, x, y + yOff, w, h, 14);
  ctx.fillStyle = "#111111";
  ctx.fill();
  ctx.strokeStyle = RULE2;
  ctx.lineWidth = 1;
  ctx.stroke();

  // title bar
  ctx.fillStyle = "#1a1a1a";
  roundRect(ctx, x, y + yOff, w, 36, 14);
  ctx.fill();
  ctx.fillRect(x, y + yOff + 20, w, 16);

  // dots
  const dotY = y + yOff + 18;
  [[AC, x + 16], [GOLD, x + 30], [GREEN, x + 44]].forEach(([c, dx]) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(dx, dotY, 5, 0, Math.PI * 2); ctx.fill();
  });

  // title
  ctx.fillStyle = "rgba(245,236,224,0.3)"; ctx.font = "14px monospace"; ctx.textAlign = "center";
  ctx.fillText("tools[0] — Bash", x + w / 2, dotY + 4);

  // badge
  ctx.fillStyle = AC10; ctx.strokeStyle = AC25;
  roundRect(ctx, x + w - 110, dotY - 12, 90, 24, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = AC; ctx.font = "bold 14px monospace"; ctx.textAlign = "center";
  ctx.fillText("JSON Schema", x + w - 65, dotY + 4);

  // code lines
  ctx.textAlign = "left"; ctx.font = "16px monospace";
  const codeX = x + 28;
  let lineY = y + yOff + 60;
  const lh = 28;
  const lines = [
    ["{", "b"],
    ['  "name": ', "k", '"Bash"', "s", ","],
    ['  "description": ', "k", '"Execute shell commands"', "s", ","],
    ['  "input_schema": ', "k", "{", "b"],
    ['    "type": ', "k", '"object"', "s", ","],
    ['    "properties": ', "k", "{", "b"],
    ['      "command": ', "k", '{ "type": "string" }', "s", ","],
    ['      "timeout": ', "k", '{ "type": "number", "default": ', "s", "120000", "n", " }", "b"],
    ["    }", "b"],
    ["  }", "b"],
    ["}", "b"],
  ];
  const colors = { k: "#ff7b72", s: "#7ee787", n: "#ffa657", b: "rgba(245,236,224,0.45)", c: "rgba(245,236,224,0.28)" };
  for (const parts of lines) {
    let cx = codeX;
    for (let i = 0; i < parts.length; i += 2) {
      const text = parts[i];
      const colorKey = parts[i + 1] || "b";
      ctx.fillStyle = colors[colorKey] || INK;
      ctx.fillText(text, cx, lineY);
      cx += ctx.measureText(text).width;
    }
    lineY += lh;
  }

  ctx.restore();
}

// ─── P2: 条形图 ───
function drawBarChart(ctx, x, y, w, progress, barProgress) {
  const bars = [
    { label: "Built-in", color: AC, fillColor: AC25, width: 0.3, value: "20+", chips: [] },
    { label: "+ MCP", color: GREEN, fillColor: "rgba(126,198,153,0.2)", width: 0.55, value: "40+", chips: ["github", "slack", "gmail"] },
    { label: "+ Deferred", color: GOLD, fillColor: "rgba(212,180,131,0.15)", width: 0.8, value: "80+", chips: [], dashed: true },
  ];

  ctx.save();
  ctx.globalAlpha = progress;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const barAlpha = barProgress[i] || 0;
    if (barAlpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = progress * barAlpha;
    const by = y + i * 52;

    // label
    ctx.fillStyle = bar.color; ctx.font = "bold 16px monospace"; ctx.textAlign = "right";
    ctx.fillText(bar.label, x + 130, by + 24);

    // track
    const trackX = x + 150;
    const trackW = w - 150;
    roundRect(ctx, trackX, by + 4, trackW, 36, 8);
    ctx.fillStyle = BG2; ctx.fill();

    // fill
    const fillW = trackW * bar.width * barAlpha;
    roundRect(ctx, trackX, by + 4, fillW, 36, 8);
    ctx.fillStyle = bar.fillColor; ctx.fill();
    if (bar.dashed) {
      ctx.strokeStyle = "rgba(212,180,131,0.3)"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      roundRect(ctx, trackX, by + 4, fillW, 36, 8); ctx.stroke();
      ctx.setLineDash([]);
    }

    // value text
    ctx.fillStyle = bar.color; ctx.font = "bold 14px monospace"; ctx.textAlign = "left";
    ctx.fillText(bar.value, trackX + 14, by + 28);

    // chips
    let chipX = trackX + 50;
    for (const chip of bar.chips) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      roundRect(ctx, chipX, by + 12, ctx.measureText(chip).width + 16, 22, 4); ctx.fill();
      ctx.fillStyle = INK50; ctx.font = "14px monospace";
      ctx.fillText(chip, chipX + 8, by + 28);
      chipX += ctx.measureText(chip).width + 24;
    }

    ctx.restore();
  }
  ctx.restore();
}

// ─── P2: 瑞士军刀 ───
function drawKnife(ctx, cx, cy, progress) {
  ctx.save();
  ctx.globalAlpha = progress;
  const yOff = (1 - progress) * 15;
  ctx.translate(0, yOff);

  // 刀柄
  roundRect(ctx, cx - 60, cy - 30, 120, 60, 10);
  ctx.fillStyle = "rgba(224,108,117,0.15)"; ctx.fill();
  ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = RED; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
  ctx.fillText("tools[]", cx, cy + 6);

  // 展开的刀片
  const blades = [
    { dx: 60, dy: -20, w: 70, h: 16, color: GREEN, fill: "rgba(126,198,153,0.2)", angle: -0.35 },
    { dx: 60, dy: 10, w: 60, h: 16, color: BLUE, fill: "rgba(138,180,204,0.2)", angle: 0.09 },
  ];
  for (const b of blades) {
    ctx.save();
    ctx.translate(cx + b.dx, cy + b.dy);
    ctx.rotate(b.angle);
    roundRect(ctx, 0, -b.h / 2, b.w, b.h, 4);
    ctx.fillStyle = b.fill; ctx.fill();
    ctx.strokeStyle = b.color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  // 虚线刀片（Deferred）
  ctx.setLineDash([4, 3]);
  const dashed = [
    { dy: 30, w: 50, angle: 0.26 },
    { dy: 46, w: 45, angle: 0.44 },
    { dy: 60, w: 40, angle: 0.61 },
  ];
  for (const d of dashed) {
    ctx.save();
    ctx.translate(cx + 60, cy + d.dy);
    ctx.rotate(d.angle);
    roundRect(ctx, 0, -7, d.w, 14, 4);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash([]);

  // 左侧刀片
  ctx.save();
  ctx.translate(cx - 60, cy + 10);
  ctx.rotate(-0.17);
  roundRect(ctx, -70, -8, 70, 16, 4);
  ctx.fillStyle = "rgba(218,119,86,0.15)"; ctx.fill();
  ctx.strokeStyle = AC; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// ─── 主渲染函数 ───
export function toolboxSlide(t, params = {}, ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const dur = params.duration || 32;
  const p1End = params.p1Duration || 12;

  // background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const pad = { x: W * 0.06, y: H * 0.06 };

  if (t < p1End) {
    // ═══ P1: 工具箱 ═══
    const pt = t;

    // 标题
    const titleP = tween(pt, 0.2, 0.5, easeOutCubic);
    ctx.save();
    ctx.globalAlpha = titleP;
    ctx.translate(0, (1 - titleP) * -12);

    // tag pill
    ctx.fillStyle = AC10; ctx.strokeStyle = AC25; ctx.lineWidth = 1;
    roundRect(ctx, pad.x, pad.y, 90, 30, 15); ctx.fill(); ctx.stroke();
    ctx.fillStyle = AC; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
    ctx.fillText("tools[]", pad.x + 45, pad.y + 20);

    // title
    ctx.fillStyle = AC; ctx.font = "bold 36px Georgia, serif"; ctx.textAlign = "left";
    ctx.fillText("工具箱", pad.x + 110, pad.y + 26);
    ctx.fillStyle = INK; ctx.font = "bold 36px Georgia, serif";
    ctx.fillText("· 20+ built-in", pad.x + 246, pad.y + 26);
    ctx.restore();

    // 6 个工具卡片
    const tools = [
      { name: "Bash", desc: "执行命令", color: GREEN, iconFn: iconBash },
      { name: "Read", desc: "读文件", color: BLUE, iconFn: iconRead },
      { name: "Edit", desc: "改文件", color: AC, iconFn: iconEdit },
      { name: "Grep", desc: "搜内容", color: GOLD, iconFn: iconGrep },
      { name: "Agent", desc: "派子任务", color: GREEN, iconFn: iconAgent },
      { name: "Skill", desc: "加载技能", color: BLUE, iconFn: iconSkill },
    ];

    const cardW = (W - pad.x * 2 - 16 * 5) / 6;
    const cardH = 110;
    const cardY = pad.y + 60;

    for (let i = 0; i < tools.length; i++) {
      const p = tween(pt, 3.8 + i * 0.5, 0.3, easeOutBack);
      const cardX = pad.x + i * (cardW + 16);
      drawCard(ctx, cardX, cardY, cardW, cardH, { ...tools[i], progress: p });
    }

    // JSON Schema 代码块
    const schemaP = tween(pt, 8.4, 0.7, easeOutCubic);
    const schemaY = cardY + cardH + 20;
    const schemaH = H - schemaY - pad.y - 50;
    drawSchemaBlock(ctx, pad.x, schemaY, W - pad.x * 2, schemaH, schemaP);

    // 底部注释
    const noteP = tween(pt, 10.0, 0.5, easeOutCubic);
    ctx.save();
    ctx.globalAlpha = noteP;
    ctx.fillStyle = INK75; ctx.font = "15px sans-serif"; ctx.textAlign = "left";
    const noteY = H - pad.y - 10;
    ctx.fillText("每个工具 = 一份完整的 JSON Schema 说明书。模型靠这个知道怎么调用。", pad.x + 28, noteY);
    ctx.fillStyle = AC; ctx.font = "bold 15px sans-serif";
    ctx.fillText("每个工具", pad.x + 28, noteY);
    ctx.restore();

  } else {
    // ═══ P2: 增长条 + 瑞士军刀 + 100+ ═══
    const pt = t - p1End;

    // 条形图
    const chartP = tween(pt, 0.2, 0.6, easeOutCubic);
    const barP = [
      1,
      tween(pt, 1.0, 0.6, easeOutCubic),
      tween(pt, 4.5, 0.6, easeOutCubic),
    ];
    drawBarChart(ctx, pad.x, pad.y, W - pad.x * 2, chartP, barP);

    // 瑞士军刀
    const knifeP = tween(pt, 10.5, 0.7, easeOutCubic);
    const knifeY = pad.y + 180;
    drawKnife(ctx, W * 0.25, knifeY + 80, knifeP);

    // 刀旁边的文字
    ctx.save();
    ctx.globalAlpha = knifeP;
    const textX = W * 0.45;
    ctx.fillStyle = GOLD; ctx.font = "italic 26px Georgia, serif"; ctx.textAlign = "left";
    ctx.fillText("\u201C有些刀片你知道有但没打开过，", textX, knifeY + 50);
    ctx.fillText("需要的时候再拽出来\u201D", textX, knifeY + 86);
    ctx.fillStyle = INK75; ctx.font = "18px sans-serif";
    ctx.fillText("Deferred 工具只注册名字，不发说明书。", textX, knifeY + 120);
    ctx.fillText("用到了才临时查 Schema — 省 token，不占上下文。", textX, knifeY + 146);
    ctx.restore();

    // 100+ 大数字
    const numP = tween(pt, 16.2, 0.5, easeOutBack);
    ctx.save();
    ctx.globalAlpha = numP;
    const scale = 0.7 + 0.3 * numP;
    const numY = H - pad.y - 40;
    ctx.translate(W / 2, numY);
    ctx.scale(scale, scale);
    ctx.fillStyle = AC; ctx.font = "900 80px Georgia, serif"; ctx.textAlign = "center";
    ctx.fillText("100+", 0, 0);
    ctx.fillStyle = INK75; ctx.font = "20px sans-serif";
    ctx.fillText("接上五六个 MCP，工具数量能到一百多个", 0, 40);
    ctx.restore();
  }
}

export const META = {
  id: "toolboxSlide",
  name: "toolboxSlide",
  category: "Series",
  description: "工具箱维度 — 6 个工具图标 + JSON Schema + 增长条 + 瑞士军刀 + 100+ 大数字",
  params: {
    duration: { type: "number", default: 32 },
    p1Duration: { type: "number", default: 12 },
  },
};
