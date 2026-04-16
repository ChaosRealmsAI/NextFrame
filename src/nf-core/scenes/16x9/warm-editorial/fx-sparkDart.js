// scenes/16x9/warm-editorial/fx-sparkDart.js
// Spark dart — sparkle flying in from off-screen with rebound.

export default {
  id: "sparkDart",
  name: "闪光飞入",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",
  description: "闪光从画外飞入中心 — dart behavior (offset x:-220→16→0 + opacity 0→1)，带回弹",
  duration_hint: 0.9,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `
    warm-editorial 主题的"引入/揭示"瞬间组件。设计取舍：
    1. dart behavior — 从 -220px 飞入 → 超过终点到 +16px → 回弹到 0，outBack easing 有物理弹性。
    2. 砖红 #c45a3c sparkle 形状 — 主题 ac 色 + 尖锐八角星，"划过"感强烈。
    3. 0.9s duration — dart 是短促爆发，不适合长时长。
    4. opacity 0→1 fade-in 配合 offset 消除"突然出现"的生硬感。
    5. 适合"揭示关键词 / 反转论断时刻 / 章节结尾金句"的前置装饰。
  `,
  when_to_use: ["揭示金句前的装饰飞入", "反转论断的视觉强调", "新概念引入的标记"],
  when_not_to_use: ["需要温柔/舒缓的场景（dart 太快）", "持续存在（dart 是一次性）"],
  limitations: ["只飞入，无飞出 — 后续消失需要配合 exit 动画或切场"],
  inspired_by: "动画片中法术特效的『光划过』 / 汽车广告的『划闪』",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-pullQuote", "icon-quoteOpen"],
  conflicts_with: [],
  alternatives: ["icon-quoteOpen"],
  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["playful", "intense"],
  tags: ["motion", "sparkle", "dart", "reveal"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    color: { type: "color", default: "#c45a3c", semantic: "闪光填充色" },
    duration: { type: "number", default: 0.9, semantic: "dart 时长" },
  },
  enter: null,
  exit: null,
  render(_host, _t, params, _vp) {
    const color = params.color || "#c45a3c";
    const duration = Number(params.duration) || 0.9;
    return {
      duration,
      size: [400, 400],
      layers: [
        {
          type: "shape",
          shape: "sparkle",
          at: [200, 200],
          size: 14,
          fill: color,
          behavior: "dart",
          startAt: 0,
          duration,
        },
      ],
    };
  },
  describe(t, params, vp) {
    return { sceneId: "sparkDart", phase: t < 0.9 ? "darting" : "landed", progress: Math.min(1, t / 0.9), visible: true, params, viewport: vp };
  },
  sample() {
    return { color: "#c45a3c", duration: 0.9 };
  },
};
