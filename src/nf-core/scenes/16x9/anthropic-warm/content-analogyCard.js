// scenes/16x9/anthropic-warm/content-analogyCard.js
// 类比卡：把抽象技术概念翻译成日常经验，强调词用橙色拉出来。

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

function tokenizeRichText(text, highlights) {
  const result = [];
  const targets = [...(highlights || [])].filter(Boolean).sort((a, b) => b.length - a.length);
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\n") {
      result.push({ text: "\n", highlight: false, newline: true });
      i += 1;
      continue;
    }
    let matched = null;
    for (const target of targets) {
      if (text.startsWith(target, i)) {
        matched = target;
        break;
      }
    }
    if (matched) {
      result.push({ text: matched, highlight: true, newline: false });
      i += matched.length;
      continue;
    }
    result.push({ text: text[i], highlight: false, newline: false });
    i += 1;
  }
  return result;
}

function wrapRichText(ctx, tokens, maxWidth) {
  const lines = [];
  let line = [];
  let width = 0;
  for (const token of tokens) {
    if (token.newline) {
      lines.push(line);
      line = [];
      width = 0;
      continue;
    }
    const tokenWidth = ctx.measureText(token.text).width;
    if (line.length && width + tokenWidth > maxWidth) {
      lines.push(line);
      line = [token];
      width = tokenWidth;
    } else {
      line.push(token);
      width += tokenWidth;
    }
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[]];
}

export default {
  // ===== 身份 =====
  id: "analogyCard",
  name: "Analogy Card 类比卡",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "居中类比说明卡，左上标签 + serif 大字正文，关键概念橙色高亮",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    这集的讲法强调“先类比，再揭技术细节”，所以 analogyCard 不是普通信息卡，而是认知转译器。它要先把观众从熟悉的日常经验拉进来，再把抽象术语挂上去，因此正文必须用更有停顿感的 serif，大字、慢节奏、行距宽，像在讲一个例子而不是列定义。左上标签只说“类比”，是为了让观众快速切换认知模式：接下来你看到的不是结论，而是一种理解桥梁。高亮词只给少量橙色，避免整张卡变成重点轰炸。
  `,

  when_to_use: [
    "解释 system prompt、memory、hook 这类抽象机制前先给日常比喻时",
    "一屏只想讲一个概念，并且需要观众暂停消化时",
    "视频口播正在讲类比而不是列参数表时",
  ],

  when_not_to_use: [
    "需要展示多点结构、流程或并列关系时",
    "内容本身已经是代码或数据，不该再转成类比句时",
    "同屏还要放太多其他信息块时，会稀释类比卡的集中度",
  ],

  limitations: [
    "长文本会自动换行，但不适合超过 120 汉字的段落",
    "高亮只适合少量关键词，过多会让整张卡失去呼吸",
    "默认居中布局，不支持左右并排双类比",
  ],

  inspired_by: "landscape-atoms/analogy-card.html 的温暖纸卡式解释节奏",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/01-intro"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["headline", "titleBar", "footer"],
  conflicts_with: ["goldenQuote", "fourSlots"],
  alternatives: ["goldenQuote", "keyPoints", "flowDiagram"],

  // ===== 视觉权重 =====
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["thoughtful", "warm", "didactic"],

  // ===== 索引 =====
  tags: [
    "类比", "analogy", "card", "explanation", "比喻", "认知桥梁",
    "serif", "教学", "warm card",
  ],

  // ===== 工程 =====
  complexity: "medium",
  performance: { cost: "low", notes: "少量文本测量和分行，无图像资源" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 类比说明卡" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    label: {
      type: "string",
      default: "类比",
      semantic: "左上角标签",
      purpose: "提示观众当前是类比模式而不是定义模式",
      constraints: ["建议 2~6 个字", "单行显示"],
    },
    text: {
      type: "string",
      required: true,
      semantic: "类比正文",
      purpose: "用自然语言把抽象概念翻译成熟悉经验",
      constraints: ["建议 ≤ 120 汉字", "支持手动换行"],
      common_mistakes: ["把技术定义原封不动塞进来，失去类比作用"],
    },
    highlights: {
      type: "array",
      default: [],
      semantic: "需要橙色强调的关键词数组",
      purpose: "拉出观众需要记住的映射点",
      constraints: ["建议 1~5 项", "每项最好为 text 的原文子串"],
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
    const cardW = W * 0.5;
    const x = (W - cardW) * 0.5;
    const padX = W * 0.034;
    const labelY = H * 0.31;
    const fontSize = H * 0.037;
    const lineH = fontSize * 1.6;

    ctx.font = `700 ${Math.round(fontSize)}px Georgia, "Hiragino Mincho ProN", "Noto Serif SC", serif`;
    const tokens = tokenizeRichText(String(params.text || ""), params.highlights || []);
    const lines = wrapRichText(ctx, tokens, cardW - padX * 2);
    const cardH = H * 0.12 + lines.length * lineH;
    const y = (H - cardH) * 0.5;

    roundedRect(ctx, x, y, cardW, cardH, W * 0.0065);
    ctx.fillStyle = "rgba(212,180,131,0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(212,180,131,0.18)";
    ctx.lineWidth = Math.max(1, W * 0.0008);
    ctx.stroke();

    const label = params.label || "类比";
    const labelPadX = W * 0.0075;
    const labelPadY = H * 0.004;
    ctx.font = `600 ${Math.round(H * 0.017)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
    const labelW = ctx.measureText(label).width + labelPadX * 2;
    const labelH = H * 0.035;
    roundedRect(ctx, x + padX, y + H * 0.03, labelW, labelH, W * 0.002);
    ctx.fillStyle = "rgba(212,180,131,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(212,180,131,0.3)";
    ctx.stroke();
    ctx.fillStyle = "#d4b483";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + padX + labelPadX, y + H * 0.03 + labelH * 0.5 + labelPadY * 0.15);

    ctx.font = `700 ${Math.round(fontSize)}px Georgia, "Hiragino Mincho ProN", "Noto Serif SC", serif`;
    let cursorY = y + H * 0.09;
    for (const line of lines) {
      let cursorX = x + padX;
      for (const token of line) {
        ctx.fillStyle = token.highlight ? "#da7756" : "#f5ece0";
        ctx.fillText(token.text, cursorX, cursorY);
        cursorX += ctx.measureText(token.text).width;
      }
      cursorY += lineH;
    }
  },

  describe(_t, params, viewport) {
    const cardW = viewport.width * 0.5;
    const cardH = viewport.height * 0.42;
    return {
      sceneId: "analogyCard",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "label", role: "tag", value: params.label || "类比" },
        { type: "text", role: "body", value: params.text || "" },
        { type: "keywords", role: "highlights", value: params.highlights || [] },
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
      label: "类比",
      text: "手机预装的系统应用。\n你买手机第一天，打电话、发短信、拍照就能用，\n不需要去应用商店下载任何东西。",
      highlights: ["系统应用", "打电话、发短信、拍照"],
    };
  },
};
