// scenes/16x9/anthropic-warm/content-keyPoints.js
// 左数字右文字的要点列表，用于把连续口播压成可记忆条目。

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
  id: "keyPoints",
  name: "Key Points 要点列表",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "左侧大数字、右侧正文的要点列表，适合列出 2~5 条关键结论",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    要点列表不是为了把内容压缩得像 PPT，而是把口播中的几个“必须记住”的结论抽成可扫描结构。左侧大数字用橙色和更重的字重，是为了让观众先抓住顺序和数量感，再去读右侧解释；右侧文字保持 sans 和舒服的行距，避免像金句卡那样过度戏剧化。这个组件最适合在讲完一个维度后做“收束”，让观众带着 2~4 个钩子继续往后听，而不是被一长段话冲掉。
  `,

  when_to_use: [
    "一个概念讲完后需要总结 2~5 个关键点时",
    "需要把数字事实和结论配对展示时",
    "观众需要快速扫一眼就建立清晰记忆锚点时",
  ],

  when_not_to_use: [
    "内容是并列卡片或分类结构，更适合 fourSlots 时",
    "需要展示流程顺序和箭头关系时",
    "只有一句话结论，应该直接用 goldenQuote 时",
  ],

  limitations: [
    "每条建议控制在 1~2 行，过长会让数字失去节奏感",
    "更适合 2~5 条，超过 5 条会显得拥挤",
    "不处理富文本高亮，强调主要依靠数字和整体结构",
  ],

  inspired_by: "landscape-atoms/key-points.html 的条列节奏，改为更明确的数字导向版式",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/04-dim-factory"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["codeBlock", "titleBar", "footer"],
  conflicts_with: ["goldenQuote"],
  alternatives: ["fourSlots", "pillTags", "statNumber"],

  // ===== 视觉权重 =====
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["clear", "structured", "confident"],

  // ===== 索引 =====
  tags: [
    "要点", "key points", "list", "summary", "数字列表", "bullet replacement",
    "teaching", "takeaways", "讲解总结",
  ],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "分行文本和分隔线，渲染轻量" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 左数字右说明的要点组件" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    title: {
      type: "string",
      default: "",
      semantic: "顶部标题",
      purpose: "给这一组要点一个总类名",
      constraints: ["建议 ≤ 16 汉字", "可为空"],
    },
    points: {
      type: "array",
      required: true,
      semantic: "要点数组",
      purpose: "按顺序列出需要观众记住的结论",
      constraints: ["建议 2~5 项", "每项包含 n/text"],
      common_mistakes: ["每项文字太长，导致列表失去节奏"],
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
    const x = W * 0.16;
    const numberX = x;
    const textX = x + W * 0.09;
    const startY = H * 0.26;
    const gapY = H * 0.145;
    const maxTextW = W * 0.56;

    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    if (params.title) {
      ctx.fillStyle = "#d4b483";
      ctx.font = `700 ${Math.round(H * 0.034)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(params.title, x, H * 0.17);
    }

    (params.points || []).forEach((point, index) => {
      const y = startY + index * gapY;
      ctx.fillStyle = "#da7756";
      ctx.font = `600 ${Math.round(H * 0.082)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(String(point.n ?? index + 1), numberX, y - H * 0.012);

      ctx.fillStyle = "rgba(245,236,224,0.12)";
      ctx.fillRect(textX - W * 0.015, y + H * 0.011, W * 0.0016, H * 0.07);

      ctx.fillStyle = "#f5ece0";
      ctx.font = `500 ${Math.round(H * 0.028)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      const lines = wrapText(ctx, point.text || "", maxTextW);
      lines.slice(0, 2).forEach((line, lineIndex) => {
        ctx.fillText(line, textX, y + lineIndex * H * 0.036);
      });
    });
  },

  describe(_t, params, viewport) {
    return {
      sceneId: "keyPoints",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "title", value: params.title || "" },
        ...(params.points || []).map((point, index) => ({
          type: "point",
          role: `point-${index + 1}`,
          value: point,
        })),
      ],
      boundingBox: {
        x: viewport.width * 0.16,
        y: viewport.height * 0.17,
        w: viewport.width * 0.68,
        h: viewport.height * 0.58,
      },
    };
  },

  sample() {
    return {
      title: "Anthropic 出厂设置",
      points: [
        { n: 1, text: "一共 9 段，按顺序拼接成最终 system prompt。" },
        { n: 2, text: "大概 3000 多字，每次对话都会发送。" },
        { n: 3, text: "全球所有用户同一份，不因你的项目而变化。" },
      ],
    };
  },
};
