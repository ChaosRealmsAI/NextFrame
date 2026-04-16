// scenes/16x9/warm-editorial/icon-quoteOpen.js
// Opening quote glyph — pops in with "impact" behavior, brick-red fill.

export default {
  id: "quoteOpen",
  name: "左引号图标",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",
  description: "左引号『 的 pop 入场 — 砖红填充大字号 serif 引号，behavior: impact 弹入",
  duration_hint: 1.5,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `
    warm-editorial 主题的引文先导装饰。设计取舍：
    1. pop 弹入（anticipation→overshoot→settle）— 0→120%→100%，比线性 scale 有"手工印章盖下"的弹力。
    2. 砖红 #c45a3c 填充 — 主题 ac 色，和米白底形成暖调撞色。
    3. 用 text 型号 lazy path 画引号而不是真字体 — 字体差异大（英式 " vs 中式『），path 稳定一致。
    4. 放在引文 content 的左上角（独立组件，不耦合在 pullQuote 里）— 可复用做不同场景装饰。
    5. size [400,400] 缩略图里引号占主体约 60%，看得清主角。
  `,
  when_to_use: ["content-pullQuote 出现前 0.6s 的先导", "章节开头出现引用作为视觉锚点", "任何需要『进入引文模式』的动画提示"],
  when_not_to_use: ["满屏引号作为装饰（太花）", "信息密度高的页面（喧宾夺主）"],
  limitations: ["同一画面不要叠加 > 2 个 quoteOpen"],
  inspired_by: "书刊引号装饰 / 广告版面的 drop cap",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-pullQuote"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["literate", "playful"],
  tags: ["icon", "quote", "pop", "decoration"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    color: { type: "color", default: "#c45a3c", semantic: "引号填充色" },
    duration: { type: "number", default: 1.5, semantic: "pop 动画总时长" },
  },
  enter: null,
  exit: null,
  render(_host, _t, params, _vp) {
    const color = params.color || "#c45a3c";
    const duration = Number(params.duration) || 1.5;
    return {
      duration,
      size: [400, 400],
      layers: [
        {
          type: "shape",
          shape: "path",
          at: [200, 200],
          path: "M-80,-60 C-80,-120 -40,-140 -20,-140 L-20,-100 C-40,-100 -60,-80 -60,-60 L-20,-60 L-20,20 L-80,20 Z M40,-60 C40,-120 80,-140 100,-140 L100,-100 C80,-100 60,-80 60,-60 L100,-60 L100,20 L40,20 Z",
          fill: color,
          behavior: "pop",
          startAt: 0,
          duration: 0.9,
        },
      ],
    };
  },
  describe(t, params, vp) {
    return { sceneId: "quoteOpen", phase: t < 0.9 ? "popping" : "hold", progress: Math.min(1, t / 0.9), visible: true, params, viewport: vp };
  },
  sample() {
    return { color: "#c45a3c", duration: 1.5 };
  },
};
