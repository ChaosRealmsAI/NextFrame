// scenes/16x9/warm-editorial/icon-leafRise.js
// Leaf rise — rise behavior fade + float up into place.

export default {
  id: "leafRise",
  name: "叶子浮现",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",
  description: "叶子从下方浮现 — rise behavior (offset y:80→0 + opacity 0→1)，outBack 有轻弹",
  duration_hint: 1,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `
    warm-editorial 主题的"自然出现"装饰组件。设计取舍：
    1. rise behavior — offset y 从 +80px 浮上到 0，opacity 渐显，整体"生长感"。
    2. 绿色 #5a8a6a — 主题 green 色，叶子传达"生机/自然/成长"。
    3. 叶子 shape 不对称 — 现有 SVG path 是左侧突起的叶形，自然不机械。
    4. 1s duration 略长于 pop/dart — rise 是温柔浮现，不是瞬间出现。
    5. 适合"读书到自然章节 / 生活方式内容 / 季节主题"。
  `,
  when_to_use: ["自然/植物/季节主题的章节装饰", "旁白中提到『生长』『萌芽』『自然』时", "书评视频秋冬季特辑"],
  when_not_to_use: ["科技/金融/严肃学术内容（绿色语义不匹配）"],
  limitations: ["叶子方向固定（左侧突起），如需对称需改 shape 或 scale x: -1"],
  inspired_by: "纸质书的手绘藤蔓装饰 / Apple 系统『提醒事项』回收动画",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-editorial", "bg-warmGlow"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "light",
  z_layer: "foreground",
  mood: ["calm", "warm"],
  tags: ["motion", "leaf", "rise", "nature"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    color: { type: "color", default: "#5a8a6a", semantic: "叶子填充色" },
    duration: { type: "number", default: 1, semantic: "rise 时长" },
  },
  enter: null,
  exit: null,
  render(_host, _t, params, _vp) {
    const color = params.color || "#5a8a6a";
    const duration = Number(params.duration) || 1;
    return {
      duration,
      size: [400, 400],
      layers: [
        {
          type: "shape",
          shape: "leaf",
          at: [200, 200],
          size: 160,
          fill: color,
          behavior: "rise",
          startAt: 0,
          duration,
        },
      ],
    };
  },
  describe(t, params, vp) {
    return { sceneId: "leafRise", phase: t < 1 ? "rising" : "settled", progress: Math.min(1, t / 1), visible: true, params, viewport: vp };
  },
  sample() {
    return { color: "#5a8a6a", duration: 1 };
  },
};
