// scenes/16x9/anthropic-warm/chrome-footer.js
// 底部品牌带：左品牌、右细线进度。用于稳定收尾，不替代 overlay-progress。

export default {
  // ===== 身份 =====
  id: "footer",
  name: "Footer 品牌底条",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "chrome",

  // ===== 一句话 =====
  description: "底部品牌带，左侧品牌署名，右侧细线进度作为收尾平衡",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    这个底部条是一个“收口件”。讲解页如果只有顶部 chrome，画面重心会偏上，尤其内容组件普遍在中上区域时，底部会显得轻而空，所以这里用品牌署名和一条很细的进度线，把画面重心重新压回下沿。它和 overlay-progress 的职责不同：overlay-progress 强调真实播放进度，这个 footer 更像品牌片尾条，重点是稳定构图和给观众一个持续的节目语境。右侧细线必须细、长、克制，只做节奏，不做强交互提示。
  `,

  when_to_use: [
    "需要在所有内容页保留统一品牌收口时",
    "希望在不抢内容的前提下给底部一点结构支撑时",
    "作为长视频系列页的固定品牌带时",
  ],

  when_not_to_use: [
    "页面底部已经被字幕条、注释条或图表坐标轴占满时",
    "需要强动态进度反馈时，应改用 overlay-progress",
    "极简封面页不希望出现品牌署名时",
  ],

  limitations: [
    "右侧仅支持单条进度线，不支持多段章节标记",
    "品牌文案建议较短，过长会挤压右侧进度线",
    "这不是字幕区，不负责滚动或多行文本布局",
  ],

  inspired_by: "原子页底部 D 区的稳定收口感 + 电视节目 lower chrome",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["titleBar", "headline", "chatSim", "codeBlock"],
  conflicts_with: ["progressBar16x9"],
  alternatives: ["无底条版本", "overlay-progress", "字幕下沿品牌条"],

  // ===== 视觉权重 =====
  visual_weight: "light",
  z_layer: "foreground",
  mood: ["steady", "editorial", "quiet"],

  // ===== 索引 =====
  tags: [
    "底部条", "footer", "brand strip", "progress line", "署名", "品牌",
    "chrome", "lower bar", "anthropic warm",
  ],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "文本 + 两条细线，渲染开销极小" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 建立底部品牌带和细线进度" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    brand: {
      type: "string",
      default: "OPC · 王宇轩",
      semantic: "左侧品牌署名",
      purpose: "固定节目制作方和作者识别",
      constraints: ["建议 ≤ 12 个汉字或等长混排", "单行显示"],
      common_mistakes: ["把副标题塞进 brand，导致底带过于拥挤"],
    },
    progress: {
      type: "number",
      default: 0.6,
      range: [0, 1],
      semantic: "右侧细线填充比例",
      purpose: "作为品牌带内部的弱进度提示",
      constraints: ["0 到 1 之间", "不替代 overlay-progress 的真实时间反馈"],
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
    const topY = H * (1020 / 1080);
    const barH = H - topY;
    const padX = W * (96 / 1920);
    const brand = params.brand || "OPC · 王宇轩";
    const progress = Math.max(0, Math.min(1, typeof params.progress === "number" ? params.progress : 0.6));
    const lineW = W * 0.22;
    const lineH = Math.max(2, H * 0.0025);
    const lineX = W - padX - lineW;
    const lineY = topY + barH * 0.54;

    ctx.fillStyle = "rgba(21,17,12,0.12)";
    ctx.fillRect(0, topY, W, barH);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(245,236,224,0.82)";
    ctx.font = `700 ${Math.round(H * 0.022)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
    ctx.fillText(brand, padX, topY + barH * 0.52);

    ctx.fillStyle = "rgba(245,236,224,0.15)";
    ctx.fillRect(lineX, lineY, lineW, lineH);

    ctx.fillStyle = "#da7756";
    ctx.fillRect(lineX, lineY, lineW * progress, lineH);
  },

  describe(_t, params, viewport) {
    const topY = viewport.height * (1020 / 1080);
    return {
      sceneId: "footer",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "brand", value: params.brand || "OPC · 王宇轩" },
        { type: "rule", role: "track", color: "rgba(245,236,224,0.15)" },
        { type: "rule", role: "fill", color: "#da7756", progress: params.progress ?? 0.6 },
      ],
      boundingBox: { x: 0, y: topY, w: viewport.width, h: viewport.height - topY },
    };
  },

  sample() {
    return {
      brand: "OPC · 王宇轩",
      progress: 0.58,
    };
  },
};
