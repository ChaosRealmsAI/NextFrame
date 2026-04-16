// scenes/16x9/warm-editorial/icon-quoteOpen.js
//
// quoteOpen — 左引号「"」的 pop 入场。curly quote glyph，砖红 ac 色，scale 0→120%→100%。

export default {
  id: "quoteOpen",
  name: "quoteOpen",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",

  description: "左引号的 pop 入场 — path 自定义 curly quote glyph，砖红填充，scale 弹入 0→120%→100%",
  duration_hint: 0.6,

  type: "motion",
  frame_pure: true,
  assets: [],

  intent: `引文是 warm-editorial 主题的灵魂 — 每期视频至少有 2-3 段名人引言或文学金句。这个组件在引文出现前 0.6s 弹出一个大号左引号作为视觉先导（verb: pop），让观众的期待从"看信息"切换到"听故事"。用 SVG path 画 curly double-quote 而不是文字，因为文字引号在不同字体里长得千奇百怪（直引号 vs 弯引号 vs 方引号），path 保证每台设备一致。砖红 #c45a3c 是主题 ac 色，和米白底形成暖调撞色。pop 的弹性曲线（0→120%→100%）比线性 scale 多一丝「手工印章盖下去」的弹力感，和杂志主题的触觉隐喻一致。尺寸 120px，放在引文块左上角做装饰锚点。`,

  when_to_use: [
    "引文出现前的视觉先导（配合 content-pullQuote 使用）",
    "章节开头的装饰性引号标记",
    "需要一个「即将出现一段话」的预告符号",
  ],

  when_not_to_use: [
    "引文已经自带引号样式（避免重复）",
    "快速连续引文（每 2s 一段 → 引号弹太频繁）",
    "不涉及引言的纯数据/图表场景",
  ],

  limitations: [
    "仅左引号（闭合引号暂未做）",
    "尺寸固定 120px，不可缩放",
    "位置居中，不可自定义偏移",
  ],

  inspired_by: "Monocle 杂志大号装饰引号 + 纽约客文章首字下沉 + 书籍扉页引言装饰",
  used_in: [],

  requires: [],
  pairs_well_with: ["content-pullQuote", "text-chapterTitle"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "light",
  z_layer: "foreground",
  mood: ["literary", "warm", "decorative"],

  tags: ["motion", "icon", "quote", "pop", "overlay", "warm-editorial"],

  complexity: "simple",
  performance: { cost: "low", notes: "单个 path shape，pop behavior" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial for warm-editorial · 引号 pop 入场" },
  ],

  params: {
    color: {
      type: "color",
      default: "#c45a3c",
      semantic: "引号填充色（默认砖红 ac）",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, vp) {
    void host;
    const W = vp.width;
    const H = vp.height;
    const cx = W * 0.5;
    const cy = H * 0.5;
    const color = params.color || "#c45a3c";
    return {
      duration: 0.6,
      size: [W, H],
      layers: [
        {
          type: "shape",
          shape: "path",
          at: [cx, cy],
          size: 120,
          path: "M28,8 C28,3.6 24.4,0 20,0 C15.6,0 12,3.6 12,8 C12,14.4 20,24 20,24 C20,24 28,14.4 28,8 Z M8,8 C8,3.6 4.4,0 0,0 C-4.4,0 -8,3.6 -8,8 C-8,14.4 0,24 0,24 C0,24 8,14.4 8,8 Z",
          fill: color,
          behavior: "pop",
          startAt: 0,
          duration: 0.6,
          minScale: 0,
          maxScale: 120,
          restScale: 100,
        },
      ],
    };
  },

  describe(t, params, vp) {
    const duration = 0.6;
    const progress = Math.min(1, Math.max(0, t / duration));
    return {
      sceneId: "quoteOpen",
      phase: progress < 1 ? "pop" : "rest",
      progress,
      visible: true,
      params,
      elements: [
        { type: "path", role: "quote-glyph", color: params.color || "#c45a3c" },
      ],
      boundingBox: { x: vp.width * 0.45, y: vp.height * 0.42, w: 120, h: 120 },
    };
  },

  sample() {
    return { color: "#c45a3c" };
  },
};
