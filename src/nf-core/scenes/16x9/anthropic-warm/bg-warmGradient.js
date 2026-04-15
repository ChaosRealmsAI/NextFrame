// scenes/16x9/anthropic-warm/bg-warmGradient.js
// 暖棕背景组件，负责底色、柔光斑和暗角。其他组件不要重复画这些层。

export default {
  // ===== 身份 =====
  id: "warmGradient",
  name: "Warm Gradient 暖棕背景",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "bg",

  // ===== 一句话 =====
  description: "全屏暖棕渐变底，带金色与橙色柔光斑以及中心向四角扩散的暗角",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    这是 anthropic-warm 主题的底板，不是一个“好看背景”而已，而是整个系列的曝光基准。主底色必须足够深，才能让米白正文、橙色强调和金色引用稳定成立；同时又不能纯黑，否则会把“深夜书房”的暖感抽空。左上金色柔光用来模拟台灯照面，右下橙色柔光用来给画面收尾，避免所有注意力都堆在左上。暗角压在最外层，是为了解决讲解视频常见的边缘发飘问题，让观众的视线自然回到中部内容区。这个组件应该始终安静、连续、不可抢戏。
  `,

  when_to_use: [
    "整集横屏 anthropic-warm 主题的所有讲解页底板",
    "需要承载大段正文、代码块、流程图等高信息密度内容时",
    "希望统一不同内容组件之间的亮度和色温时",
  ],

  when_not_to_use: [
    "已经有真实截图、视频或插画做全屏主画面时",
    "需要更强烈品牌色或高对比冷色科技感时",
    "场景本身要承担进场动画主体而不是做背景时",
  ],

  limitations: [
    "只负责静态背景，不提供粒子、噪点或动态呼吸光",
    "默认假设前景内容位于安全区内，不能替代内容级遮罩",
    "色彩为暖棕体系，不适合直接复用到 lecture-light 等浅色主题",
  ],

  inspired_by: "Anthropic 官方暖橙视觉 + 深夜书房式低照度讲解背景",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07"],

  // ===== 配伍 =====
  requires: [],
  pairs_well_with: ["titleBar", "footer", "goldenQuote", "codeBlock", "flowDiagram"],
  conflicts_with: ["darkGradient", "gradientBg", "interviewBg"],
  alternatives: ["darkGradient", "静态截图背景", "实拍桌面背景"],

  // ===== 视觉权重 =====
  visual_weight: "medium",
  z_layer: "background",
  mood: ["calm", "warm", "serious", "focused"],

  // ===== 索引 =====
  tags: [
    "背景", "background", "gradient", "warm", "暖棕", "vignette", "柔光",
    "anthropic", "full-bleed", "横屏", "lecture bg",
  ],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "每帧 4 次渐变填充，无逐像素计算" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 建立 anthropic-warm 全屏背景底板" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    intensity: {
      type: "number",
      default: 1,
      range: [0.6, 1.4],
      semantic: "整体柔光强度倍率",
      purpose: "在不改颜色体系的前提下微调背景存在感",
      constraints: ["建议保持 0.8~1.2", "过高会干扰前景文字可读性"],
      common_mistakes: ["把 intensity 当成亮度开关拉太高，导致前景发灰"],
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
    const intensity = typeof params.intensity === "number" ? params.intensity : 1;

    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#211c15");
    base.addColorStop(0.42, "#1f1913");
    base.addColorStop(1, "#1a1510");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    const goldGlow = ctx.createRadialGradient(W * 0.14, H * 0.15, 0, W * 0.14, H * 0.15, W * 0.34);
    goldGlow.addColorStop(0, `rgba(212,180,131,${0.085 * intensity})`);
    goldGlow.addColorStop(0.45, `rgba(212,180,131,${0.045 * intensity})`);
    goldGlow.addColorStop(1, "rgba(212,180,131,0)");
    ctx.fillStyle = goldGlow;
    ctx.fillRect(0, 0, W, H);

    const orangeGlow = ctx.createRadialGradient(W * 0.84, H * 0.82, 0, W * 0.84, H * 0.82, W * 0.3);
    orangeGlow.addColorStop(0, `rgba(218,119,86,${0.07 * intensity})`);
    orangeGlow.addColorStop(0.5, `rgba(218,119,86,${0.035 * intensity})`);
    orangeGlow.addColorStop(1, "rgba(218,119,86,0)");
    ctx.fillStyle = orangeGlow;
    ctx.fillRect(0, 0, W, H);

    const vignette = ctx.createRadialGradient(W * 0.5, H * 0.48, W * 0.12, W * 0.5, H * 0.48, W * 0.78);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.58, "rgba(0,0,0,0.08)");
    vignette.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  },

  describe(_t, params, viewport) {
    return {
      sceneId: "warmGradient",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "fill", role: "base", color: "#1a1510" },
        { type: "glow", role: "gold", color: "#d4b483", x: viewport.width * 0.14, y: viewport.height * 0.15 },
        { type: "glow", role: "orange", color: "#da7756", x: viewport.width * 0.84, y: viewport.height * 0.82 },
        { type: "overlay", role: "vignette", color: "rgba(0,0,0,0.42)" },
      ],
      boundingBox: { x: 0, y: 0, w: viewport.width, h: viewport.height },
    };
  },

  sample() {
    return {
      intensity: 1,
    };
  },
};
