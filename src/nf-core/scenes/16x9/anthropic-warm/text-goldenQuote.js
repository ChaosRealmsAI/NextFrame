// scenes/16x9/anthropic-warm/text-goldenQuote.js
// 金句卡：上下引号 + 大号 serif 文本，适合章节收束或价值判断。

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const chars = String(text || "").split("");
  const lines = [];
  let current = "";
  for (const ch of chars) {
    if (ch === "\n") {
      lines.push(current);
      current = "";
      continue;
    }
    const next = current + ch;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export default {
  // ===== 身份 =====
  id: "goldenQuote",
  name: "Golden Quote 金句卡",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "text",

  // ===== 一句话 =====
  description: "居中的金句引用卡，金色描边与半透明底承托大号 serif 文本",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    金句卡要解决的是“高密度讲解里如何给一句判断留出呼吸”的问题。普通 headline 更像标题，statNumber 更像数据冲击，而 goldenQuote 需要把一句话提升成价值判断或章节结论，所以我用 serif、大留白和金色边框去拉开语气层级。背景只给 12% 的金色透明度，是为了让它像纸页被灯光照到，而不是像弹窗。上下引号的作用不是装饰，而是明确告诉观众：这里要停一下，这一句值得被记住。署名要小且退后，只在需要时补上下文，不和正文争主次。
  `,

  when_to_use: [
    "章节收束时抛出一句核心判断或方法论",
    "开场用一句总金句建立认知缺口时",
    "需要把叙述语气从解释切到结论时",
  ],

  when_not_to_use: [
    "正文还在连续推理、不能打断阅读流时",
    "一屏里已经有太多强调色和大字时",
    "内容是代码、流程或结构列表而不是判断句时",
  ],

  limitations: [
    "长段落会变成多行，不适合承载超过 70 汉字的正文",
    "署名只支持短文本，不支持头像或复杂出处信息",
    "不做逐字高亮或关键词着色，整句语气必须统一",
  ],

  inspired_by: "Anthropic 风格引语卡 + 书页式金色注释框",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/33-closing"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["titleBar", "footer"],
  conflicts_with: ["headline", "statNumber"],
  alternatives: ["headline", "statNumber", "analogyCard"],

  // ===== 视觉权重 =====
  visual_weight: "heavy",
  z_layer: "foreground",
  mood: ["reflective", "warm", "serious", "memorable"],

  // ===== 索引 =====
  tags: [
    "金句", "quote", "closing line", "serif", "引用", "结论",
    "anthropic warm", "highlight statement", "收束",
  ],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "卡片、描边和少量文本，无复杂循环" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 金色引用卡组件" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    quote: {
      type: "string",
      required: true,
      semantic: "主金句文本",
      purpose: "承载需要停顿记忆的核心一句",
      constraints: ["建议 ≤ 70 汉字", "支持手动换行"],
      common_mistakes: ["把整段正文塞进 quote，导致失去金句感"],
    },
    author: {
      type: "string",
      default: "",
      semantic: "署名或来源",
      purpose: "补充是谁说的或该句的上下文",
      constraints: ["建议 ≤ 20 汉字", "可为空"],
    },
  },

  // ===== 动画钩子 =====
  enter: null,
  exit: null,

  // ========================================
  // ===== 三函数 =====
  // ========================================

  render(ctx, _t, params, viewport) {
    const W = viewport.width;
    const H = viewport.height;
    const cardW = W * 0.58;
    const x = (W - cardW) * 0.5;
    const textMaxW = cardW - W * 0.08;
    const quoteSize = H * 0.052;
    const authorSize = H * 0.024;

    ctx.font = `700 ${Math.round(quoteSize)}px Georgia, "Hiragino Mincho ProN", "Noto Serif SC", serif`;
    const lines = wrapText(ctx, params.quote || "", textMaxW);
    const lineH = quoteSize * 1.45;
    const cardH = H * 0.18 + lines.length * lineH + (params.author ? authorSize * 1.9 : 0);
    const y = (H - cardH) * 0.5;

    roundedRect(ctx, x, y, cardW, cardH, W * 0.008);
    ctx.fillStyle = "rgba(212,180,131,0.12)";
    ctx.fill();
    ctx.strokeStyle = "#d4b483";
    ctx.lineWidth = Math.max(1.5, W * 0.001);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(212,180,131,0.68)";
    ctx.font = `700 ${Math.round(H * 0.08)}px Georgia, "Hiragino Mincho ProN", "Noto Serif SC", serif`;
    ctx.fillText("“", W * 0.5, y + H * 0.03);

    ctx.fillStyle = "#f5ece0";
    ctx.font = `700 ${Math.round(quoteSize)}px Georgia, "Hiragino Mincho ProN", "Noto Serif SC", serif`;
    const textY = y + H * 0.09;
    lines.forEach((line, index) => {
      ctx.fillText(line, W * 0.5, textY + index * lineH);
    });

    ctx.fillStyle = "rgba(212,180,131,0.68)";
    ctx.font = `700 ${Math.round(H * 0.08)}px Georgia, "Hiragino Mincho ProN", "Noto Serif SC", serif`;
    ctx.fillText("”", W * 0.5, y + cardH - H * 0.09);

    if (params.author) {
      ctx.fillStyle = "rgba(245,236,224,0.75)";
      ctx.font = `600 ${Math.round(authorSize)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(`— ${params.author}`, W * 0.5, y + cardH - H * 0.07);
    }
  },

  describe(_t, params, viewport) {
    const cardW = viewport.width * 0.58;
    const cardH = viewport.height * 0.36;
    return {
      sceneId: "goldenQuote",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "shape", role: "card", color: "rgba(212,180,131,0.12)" },
        { type: "text", role: "quote", value: params.quote || "" },
        { type: "text", role: "author", value: params.author || "" },
      ],
      boundingBox: {
        x: (viewport.width - cardW) * 0.5,
        y: (viewport.height - cardH) * 0.5,
        w: cardW,
        h: cardH,
      },
    };
  },

  sample() {
    return {
      quote: "你写了 1 行，系统拼了 87 类。\n每一轮，重新拼一遍。",
      author: "Claude Code",
    };
  },
};
