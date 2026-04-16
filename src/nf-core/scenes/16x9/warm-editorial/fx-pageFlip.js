// scenes/16x9/warm-editorial/fx-pageFlip.js
//
// pageFlip — 纸张翻页动效。矩形 shape 从左到右旋转 + 透明度变化，模拟纸张翻转。

export default {
  id: "pageFlip",
  name: "pageFlip",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",

  description: "翻页动效 — 矩形 shape rotateY 0→-180° + opacity 1→0，模拟纸张翻转的物理感",
  duration_hint: 1.2,

  type: "motion",
  frame_pure: true,
  assets: [],

  intent: `杂志主题的核心隐喻就是「翻书」— 观众脑中有一个根深蒂固的心智模型：纸张从右向左翻过去，露出下一页。这个组件把这个隐喻做成可复用的 motion overlay：一个米白矩形从 rotateY(0) 旋转到 rotateY(-180°)，同时 opacity 从 1 衰减到 0，模拟纸张翻转后背面消失。duration 1.2s 是纸质感的最佳节奏 — 比 0.8s 快了像 app 切页，比 1.6s 慢了像 PPT。用在章节转场、引文切换、内容卡翻页等「翻到下一页」的语义时刻。颜色用 bg (#f7f3ec) 保持纸质一致性，边缘带 1px ink-60 细线模拟纸张边缘阴影。`,

  when_to_use: [
    "章节转场（从一个 content 翻到下一个 content）",
    "引文切换（一段话翻过，露出下一段）",
    "任何需要「翻书」隐喻的过渡",
  ],

  when_not_to_use: [
    "不涉及内容切换的场景（用 fadeIn/fadeOut 即可）",
    "需要快速切换（< 0.5s）的 Hook 帧",
    "竖屏比例（翻页横向旋转在竖屏不自然）",
  ],

  limitations: [
    "仅支持从右向左翻页（左到右需 mirror 参数，暂未实现）",
    "矩形尺寸写死 viewport 60% × 70%，不可自定义",
    "duration 固定 1.2s，不接受外部 duration 覆盖",
  ],

  inspired_by: "Monocle 杂志实体翻页 + Kindle 翻页动画 + 纸质书的物理翻转",
  used_in: [],

  requires: [],
  pairs_well_with: ["content-editorial", "content-pullQuote", "text-chapterTitle"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["elegant", "transitional", "warm"],

  tags: ["motion", "page", "flip", "transition", "overlay", "warm-editorial"],

  complexity: "simple",
  performance: { cost: "low", notes: "单矩形 shape，rotate + opacity 两个 track" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial for warm-editorial · 翻页转场动效" },
  ],

  params: {
    color: {
      type: "color",
      default: "#f7f3ec",
      semantic: "纸张颜色（默认 bg 米白）",
    },
    borderColor: {
      type: "color",
      default: "rgba(44,36,24,.15)",
      semantic: "纸张边缘线颜色",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, vp) {
    void host;
    const W = vp.width;
    const H = vp.height;
    const color = params.color || "#f7f3ec";
    const borderColor = params.borderColor || "rgba(44,36,24,.15)";
    const cx = W * 0.5;
    const cy = H * 0.5;
    const rectW = W * 0.6;
    const rectH = H * 0.7;
    return {
      duration: 1.2,
      size: [W, H],
      layers: [
        {
          type: "shape",
          shape: "rect",
          at: [cx, cy],
          size: [rectW, rectH],
          fill: color,
          stroke: borderColor,
          strokeWidth: 1,
          behavior: "custom",
          tracks: {
            rotate: { keys: [{ t: 0, v: 0 }, { t: 1.2, v: -180 }], easing: "easeInOutCubic" },
            opacity: { keys: [{ t: 0, v: 1 }, { t: 0.8, v: 0.85 }, { t: 1.2, v: 0 }], easing: "easeInCubic" },
          },
        },
      ],
    };
  },

  describe(t, params, vp) {
    const duration = 1.2;
    const progress = Math.min(1, Math.max(0, t / duration));
    return {
      sceneId: "pageFlip",
      phase: progress < 1 ? "flipping" : "done",
      progress,
      visible: progress < 1,
      params,
      elements: [
        { type: "rect", role: "page", rotate: -180 * progress, opacity: Math.max(0, 1 - progress) },
      ],
      boundingBox: { x: vp.width * 0.2, y: vp.height * 0.15, w: vp.width * 0.6, h: vp.height * 0.7 },
    };
  },

  sample() {
    return { color: "#f7f3ec", borderColor: "rgba(44,36,24,.15)" };
  },
};
