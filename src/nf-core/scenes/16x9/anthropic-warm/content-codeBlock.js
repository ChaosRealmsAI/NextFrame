// scenes/16x9/anthropic-warm/content-codeBlock.js
// mono 代码块：标题栏、行号和简单语法高亮。

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

function splitHighlightedCode(line) {
  const commentIndex = line.indexOf("//");
  const codePart = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const commentPart = commentIndex >= 0 ? line.slice(commentIndex) : "";
  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:function|const|let|return|if|else|await|async|for|while|try|catch|new|class|fn|pub|impl|match|use|struct|enum)\b)/g;
  const segments = [];
  let last = 0;
  let match = regex.exec(codePart);
  while (match) {
    if (match.index > last) {
      segments.push({ text: codePart.slice(last, match.index), kind: "plain" });
    }
    const value = match[0];
    const kind = value[0] === '"' || value[0] === "'" || value[0] === "`" ? "string" : "keyword";
    segments.push({ text: value, kind });
    last = match.index + value.length;
    match = regex.exec(codePart);
  }
  if (last < codePart.length) {
    segments.push({ text: codePart.slice(last), kind: "plain" });
  }
  if (commentPart) segments.push({ text: commentPart, kind: "comment" });
  return segments;
}

export default {
  // ===== 身份 =====
  id: "codeBlock",
  name: "Code Block 代码块",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "暖棕主题下的 mono 代码块，含标题栏、行号与三色简单语法高亮",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    代码块在这集里承担的是“把抽象讲解落回源码证据”的职责，所以视觉上必须像真实编辑器，但不能像 IDE 截图那样噪音太多。标题栏、三颗圆点和行号提供足够的代码语境，让观众瞬间知道这是源码层；背景用更深的 inset 棕色，是为了把它从普通信息卡里分离出来。语法高亮只保留 keyword / string / comment 三类，是刻意克制的选择：讲解视频里真正重要的是结构和调用关系，不是完整编辑器配色还原。
  `,

  when_to_use: [
    "需要展示 prompts.ts、claude.ts 一类源码片段时",
    "口播正在解释某一段拼装逻辑，需要给观众证据支撑时",
    "需要配合 statNumber 或 keyPoints 把概念落到具体实现时",
  ],

  when_not_to_use: [
    "代码太长，无法在一屏内保持可读行高时",
    "主要目的是讲流程或关系，而不是逐行看代码时",
    "需要真实截图细节，例如 IDE 诊断、diff 颜色等时",
  ],

  limitations: [
    "语法高亮是轻量规则，不会解析嵌套语言或复杂注释",
    "单行过长会裁切，不做水平滚动",
    "默认适配 8~14 行左右，太多行会压缩可读性",
  ],

  inspired_by: "landscape-atoms/code-block.html 的编辑器抽象层",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/04-dim-factory"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["titleBar", "footer", "keyPoints", "statNumber"],
  conflicts_with: ["chatSim"],
  alternatives: ["source-reveal", "terminal", "file-tree"],

  // ===== 视觉权重 =====
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["technical", "focused", "evidence-based"],

  // ===== 索引 =====
  tags: [
    "代码", "code", "code block", "source", "mono", "syntax highlight",
    "editor", "typescript", "rust", "源码讲解",
  ],

  // ===== 工程 =====
  complexity: "medium",
  performance: { cost: "medium", notes: "每帧多次 fillText 和 measureText，但行数有限" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 单文件代码块组件" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    title: {
      type: "string",
      required: true,
      semantic: "代码块标题栏文件名",
      purpose: "告诉观众当前片段来自哪个文件或模块",
      constraints: ["建议 ≤ 40 字符", "单行显示"],
    },
    lines: {
      type: "array",
      required: true,
      semantic: "代码文本数组",
      purpose: "逐行展示需要讲解的源码内容",
      constraints: ["建议 4~14 行", "每项为字符串"],
      common_mistakes: ["把整段长文件直接塞进来，字号被迫缩小"],
    },
    lang: {
      type: "string",
      default: "ts",
      semantic: "代码语言提示",
      purpose: "给讲解者和后续维护者一个最低限度语言上下文",
      constraints: ["仅作语义标注，不影响高亮规则"],
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
    const boxW = W * 0.625;
    const boxH = H * 0.56;
    const x = (W - boxW) * 0.5;
    const y = (H - boxH) * 0.5;
    const headerH = H * 0.058;
    const padX = W * 0.015;
    const fontSize = H * 0.022;
    const lineH = fontSize * 1.75;
    const lines = Array.isArray(params.lines) ? params.lines : [];

    roundedRect(ctx, x, y, boxW, boxH, W * 0.0055);
    ctx.fillStyle = "#15110c";
    ctx.fill();
    ctx.strokeStyle = "rgba(245,236,224,0.08)";
    ctx.lineWidth = Math.max(1, W * 0.0008);
    ctx.stroke();

    roundedRect(ctx, x, y, boxW, headerH, W * 0.0055);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(245,236,224,0.04)";
    ctx.fillRect(x, y, boxW, headerH);
    ctx.restore();

    ctx.strokeStyle = "rgba(245,236,224,0.06)";
    ctx.beginPath();
    ctx.moveTo(x, y + headerH);
    ctx.lineTo(x + boxW, y + headerH);
    ctx.stroke();

    const dotY = y + headerH * 0.5;
    const dotR = H * 0.0046;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(245,236,224,0.15)";
      ctx.arc(x + padX + i * dotR * 3.2, dotY, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(245,236,224,0.75)";
    ctx.font = `600 ${Math.round(H * 0.015)}px "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace`;
    ctx.fillText(params.title || "snippet.ts", x + padX + dotR * 12, dotY);

    const bodyX = x + padX;
    const bodyY = y + headerH + H * 0.03;
    const lnWidth = W * 0.034;
    ctx.font = `500 ${Math.round(fontSize)}px "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace`;
    for (let i = 0; i < lines.length; i += 1) {
      const lineY = bodyY + i * lineH;
      if (lineY > y + boxH - H * 0.03) break;

      ctx.fillStyle = "rgba(245,236,224,0.4)";
      ctx.textAlign = "right";
      ctx.fillText(String(i + 1), bodyX + lnWidth, lineY);

      let cursorX = bodyX + lnWidth + W * 0.014;
      ctx.textAlign = "left";
      const segments = splitHighlightedCode(String(lines[i] || ""));
      for (const segment of segments) {
        if (segment.kind === "keyword") ctx.fillStyle = "#da7756";
        else if (segment.kind === "string") ctx.fillStyle = "#7ec699";
        else if (segment.kind === "comment") ctx.fillStyle = "rgba(245,236,224,0.6)";
        else ctx.fillStyle = "#f5ece0";
        ctx.fillText(segment.text, cursorX, lineY);
        cursorX += ctx.measureText(segment.text).width;
      }
    }
  },

  describe(_t, params, viewport) {
    const boxW = viewport.width * 0.625;
    const boxH = viewport.height * 0.56;
    return {
      sceneId: "codeBlock",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "title", value: params.title || "" },
        { type: "list", role: "lines", value: params.lines || [] },
        { type: "text", role: "lang", value: params.lang || "ts" },
      ],
      boundingBox: {
        x: (viewport.width - boxW) * 0.5,
        y: (viewport.height - boxH) * 0.5,
        w: boxW,
        h: boxH,
      },
    };
  },

  sample() {
    return {
      title: "buildSystemPrompt.ts",
      lang: "ts",
      lines: [
        "function buildSystemPrompt() {",
        "  const segments = []",
        "",
        "  // 第一段：身份声明（写死）",
        "  segments.push(\"You are Claude, made by Anthropic.\")",
        "",
        "  // 第二段：CLAUDE.md 九层合并",
        "  segments.push(mergeClaudeMd(9))",
        "",
        "  return segments.join(\"\\n\\n\")",
        "}",
      ],
    };
  },
};
