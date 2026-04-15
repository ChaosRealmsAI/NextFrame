// scenes/16x9/anthropic-warm/text-headline.js
// 模板组件 — 复制此文件作为新组件起点。所有 18 AI 理解字段齐全。

export default {
  // ===== 身份 =====
  id: "headline",
  name: "Headline 大标题",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "text",

  // ===== 一句话 =====
  description: "居中或左上角的大标题文本，可带副标题",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    讲解类视频的 slide 主标题。设计取舍：
    1. 字号 72px 是测试出来的"远 3m 看清楚但不抢戏"的平衡点。
    2. 居中 + 副标题在下，是最稳的"开场"模式（参考 Apple keynote）。
    3. 可选左上角对齐，用于章节小节标题。
    4. 主标题用 ink 米白，副标题用 ink-50 半透，建立明确层级。
    5. 不做花字 / 渐变 / 阴影 — 讲解视频要稳定可读，不抢内容焦点。
    6. 进入动画走 timeline 的 enter 钩子，组件本身只负责静态绘制。
  `,

  when_to_use: [
    "slide 开头介绍主题",
    "章节切换的标题页",
    "金句 / 核心观点的视觉锚",
  ],

  when_not_to_use: [
    "需要打字机动画（用 text-typewriter）",
    "需要超大封面字（用 text-display 96px）",
    "需要带强调高亮的句子（用 text-highlightLine）",
  ],

  limitations: [
    "单行 ≤ 24 个汉字 / 36 个英文字符，超出会被裁切",
    "副标题最多两行",
    "不支持 RTL 语言",
    "不做颜色高亮 — 整句一个颜色",
  ],

  inspired_by: "Apple keynote 标题页 + Anthropic 官方品牌 H1 留白",
  used_in: [],

  // ===== 配伍 =====
  requires: ["bg-warmGradient"],
  pairs_well_with: ["chrome-titleBar", "overlay-progress", "content-analogyCard"],
  conflicts_with: ["text-display"],
  alternatives: ["text-typewriter", "text-display", "text-highlightLine"],

  // ===== 视觉权重 =====
  visual_weight: "heavy",
  z_layer: "foreground",
  mood: ["calm", "informative", "professional"],

  // ===== 索引 =====
  tags: [
    "标题", "headline", "title", "h1", "封面", "章节",
    "anthropic", "keynote", "中文", "横屏",
  ],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "每帧 1-2 次 fillText，无路径计算" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 模板组件" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    title: {
      type: "string",
      required: true,
      semantic: "主标题文本",
      purpose: "slide 的视觉锚点，观众第一眼看到",
      constraints: ["≤ 24 汉字", "≤ 36 英文字符", "不含 \\n"],
      common_mistakes: ["塞两行 — 应拆成 title + subtitle"],
    },
    subtitle: {
      type: "string",
      default: "",
      semantic: "副标题（可选）",
      purpose: "解释主标题或给上下文",
      constraints: ["≤ 60 汉字 / 90 英文字符", "可换 \\n"],
    },
    align: {
      type: "select",
      default: "center",
      options: ["center", "left-top"],
      semantic: "对齐方式",
      rationale: "center 用于章节开场，left-top 用于内容页小节标题",
      visual_impact: "high",
    },
    color: {
      type: "color",
      default: "#f5ece0",
      semantic: "主标题文字色",
    },
    accent: {
      type: "color",
      default: "#da7756",
      semantic: "副标题点缀色（仅左侧短线用）",
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
    const align = params.align || "center";
    const color = params.color || "#f5ece0";
    const accent = params.accent || "#da7756";
    const titleSize = 72;
    const subSize = 32;

    ctx.fillStyle = color;
    ctx.font = `600 ${titleSize}px system-ui, -apple-system, "PingFang SC", sans-serif`;

    if (align === "center") {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cy = params.subtitle ? H * 0.45 : H * 0.5;
      ctx.fillText(params.title, W * 0.5, cy);

      if (params.subtitle) {
        ctx.fillStyle = "rgba(245,236,224,0.5)";
        ctx.font = `400 ${subSize}px system-ui, -apple-system, "PingFang SC", sans-serif`;
        const lines = String(params.subtitle).split("\n");
        lines.forEach((line, i) => {
          ctx.fillText(line, W * 0.5, H * 0.55 + i * subSize * 1.4);
        });
      }
    } else {
      // left-top
      const x = W * 0.05; // 96px
      const y = H * 0.13;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // 左侧短线
      ctx.fillStyle = accent;
      ctx.fillRect(x, y + titleSize * 0.35, 8, titleSize * 0.5);

      ctx.fillStyle = color;
      ctx.fillText(params.title, x + 24, y);

      if (params.subtitle) {
        ctx.fillStyle = "rgba(245,236,224,0.5)";
        ctx.font = `400 ${subSize}px system-ui, -apple-system, "PingFang SC", sans-serif`;
        const lines = String(params.subtitle).split("\n");
        lines.forEach((line, i) => {
          ctx.fillText(line, x + 24, y + titleSize * 1.3 + i * subSize * 1.4);
        });
      }
    }
  },

  describe(_t, params, viewport) {
    const align = params.align || "center";
    const elements = [
      { type: "text", role: "title", value: params.title || "" },
    ];
    if (params.subtitle) {
      elements.push({ type: "text", role: "subtitle", value: params.subtitle });
    }
    return {
      sceneId: "headline",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements,
      boundingBox:
        align === "center"
          ? { x: 0, y: viewport.height * 0.4, w: viewport.width, h: viewport.height * 0.2 }
          : { x: viewport.width * 0.05, y: viewport.height * 0.13, w: viewport.width * 0.9, h: 200 },
    };
  },

  sample() {
    return {
      title: "你写了 1 行，系统拼了 87 类",
      subtitle: "Claude Code 内部到底有多少东西，是你看不到的",
      align: "center",
    };
  },
};
