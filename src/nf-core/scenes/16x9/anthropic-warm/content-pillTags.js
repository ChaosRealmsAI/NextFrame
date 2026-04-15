// scenes/16x9/anthropic-warm/content-pillTags.js
// pill 标签组：横向或网格排布，适合列职责、能力或黑名单。

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

function pillStyle(index, variant) {
  if (variant === "danger") return { fill: "rgba(224,108,117,0.12)", stroke: "rgba(224,108,117,0.3)", text: "#e06c75", mono: true };
  if (variant === "success") return { fill: "rgba(126,198,153,0.12)", stroke: "rgba(126,198,153,0.3)", text: "#7ec699", mono: false };
  if (variant === "mixed") {
    const palette = [
      { fill: "rgba(218,119,86,0.12)", stroke: "rgba(218,119,86,0.3)", text: "#da7756", mono: false },
      { fill: "rgba(212,180,131,0.12)", stroke: "rgba(212,180,131,0.3)", text: "#d4b483", mono: false },
      { fill: "rgba(126,198,153,0.12)", stroke: "rgba(126,198,153,0.3)", text: "#7ec699", mono: false },
      { fill: "rgba(138,180,204,0.12)", stroke: "rgba(138,180,204,0.3)", text: "#8ab4cc", mono: false },
    ];
    return palette[index % palette.length];
  }
  return { fill: "rgba(218,119,86,0.12)", stroke: "rgba(218,119,86,0.3)", text: "#da7756", mono: false };
}

export default {
  // ===== 身份 =====
  id: "pillTags",
  name: "Pill Tags 圆角标签",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "横向或网格布局的 pill 标签，适合列举职责、规则或分类项",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    pillTags 适合表达“一组同类东西”，而不适合承载解释段落。它的作用是把一堆概念压缩成可快速扫读的标签墙，让观众先建立范围感，再配合口播逐个理解。圆角矩形比普通 bullet 更像一个个独立模块，能传达“这些都是可枚举的项”；但它又比卡片轻，不会把每个词都抬成同等重量的内容页。variant 的存在是为了让同一个结构可以表达主职责、危险黑名单或混合分类，而不需要重造不同组件。
  `,

  when_to_use: [
    "列出 system prompt 的职责、工具能力或黑名单时",
    "需要快速扫过多个短标签，建立范围感时",
    "正文还没展开前，先给观众一个概念清单时",
  ],

  when_not_to_use: [
    "每项都需要详细解释或多行说明时",
    "标签有明显顺序关系，应改用流程图或列表时",
    "标签数量极少且需要重量感时，应该用四槽位或 keyPoints",
  ],

  limitations: [
    "标签越短越好，长句会破坏 pill 的轻量节奏",
    "更适合 4~12 个标签，过多会像密集词云",
    "不负责多层分组标题，复杂分类应拆成多个组件",
  ],

  inspired_by: "landscape-atoms/pill-tags.html 的模块化标签语法",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/19-summary"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["titleBar", "footer", "statNumber"],
  conflicts_with: ["fourSlots"],
  alternatives: ["keyPoints", "fourSlots", "compare-cols"],

  // ===== 视觉权重 =====
  visual_weight: "light",
  z_layer: "mid",
  mood: ["organized", "nimble", "informative"],

  // ===== 索引 =====
  tags: [
    "标签", "pill", "tags", "chips", "taxonomy", "职责列表",
    "rule list", "blacklist", "分类", "grid tags",
  ],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "仅测量文本并绘制圆角矩形" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 圆角标签组组件" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    tags: {
      type: "array",
      required: true,
      semantic: "标签字符串数组",
      purpose: "快速列出同类概念、规则或关键词",
      constraints: ["建议 4~12 项", "每项尽量短"],
      common_mistakes: ["把完整句子当 tag，导致像错用卡片"],
    },
    variant: {
      type: "string",
      default: "grid",
      semantic: "布局和配色变体",
      purpose: "在同一组件里覆盖常规、混合和危险场景",
      constraints: ["grid、row、mixed、danger、success"],
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
    const tags = Array.isArray(params.tags) ? params.tags : [];
    const variant = params.variant || "grid";
    const maxW = W * 0.58;
    let x = W * 0.21;
    let y = H * 0.38;
    const lineStartX = x;
    const gapX = W * 0.012;
    const gapY = H * 0.018;
    const fontSize = Math.round(H * 0.024);
    const pillH = H * 0.05;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    tags.forEach((tag, index) => {
      const style = pillStyle(index, variant === "row" ? "accent" : variant);
      ctx.font = `${style.mono ? 700 : 600} ${fontSize}px ${style.mono ? '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace' : 'system-ui, -apple-system, "PingFang SC", sans-serif'}`;
      const pillW = ctx.measureText(tag).width + W * 0.022;

      if (variant !== "row" && x + pillW > lineStartX + maxW) {
        x = lineStartX;
        y += pillH + gapY;
      }

      roundedRect(ctx, x, y, pillW, pillH, pillH * 0.5);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = Math.max(1, W * 0.0007);
      ctx.stroke();

      ctx.fillStyle = style.text;
      ctx.fillText(tag, x + W * 0.011, y + pillH * 0.54);

      x += pillW + gapX;
    });
  },

  describe(_t, params, viewport) {
    return {
      sceneId: "pillTags",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "tags", role: "tags", value: params.tags || [] },
        { type: "text", role: "variant", value: params.variant || "grid" },
      ],
      boundingBox: {
        x: viewport.width * 0.21,
        y: viewport.height * 0.38,
        w: viewport.width * 0.58,
        h: viewport.height * 0.28,
      },
    };
  },

  sample() {
    return {
      variant: "grid",
      tags: ["我是谁", "做任务的规则", "安全红线", "怎么用工具", "语气风格", "输出效率"],
    };
  },
};
