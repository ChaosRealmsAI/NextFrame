// scenes/16x9/warm-editorial/fx-heartThrob.js
// Heart throb — pulse behavior loop (seamless)

export default {
  id: "heartThrob",
  name: "爱心脉动",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",
  description: "爱心 pulse 循环 — scale 80%↔110% + opacity 0.6↔1 呼吸，loop 无缝，书评/情感章节用",
  duration_hint: 4,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `
    warm-editorial 主题的情感强调组件。设计取舍：
    1. pulse behavior 自动生成对称 keyframes — 80%→110%→80% scale + opacity 脉动，loop 无缝（t=2s 和 t=0s 完全一致）。
    2. 砖红 #c45a3c 心形 — 主题 ac 色，情感色。
    3. 放在 content 卡片角落或书脊旁作为持久装饰，不抢主内容视线。
    4. size [400,400] 让 gallery 缩略图里看得清脉动。
    5. duration 2s 一个周期，节奏"悠长呼吸"而非"急促心跳"。
  `,
  when_to_use: ["书评视频爱的章节", "情感类内容的主题情绪提示", "章节封面角落的持久装饰"],
  when_not_to_use: ["急促紧张的内容（节奏不匹配）", "严肃学术场景（情感色太强）"],
  limitations: ["loop 无缝需要 pulse behavior 支持（runtime 已保证）"],
  inspired_by: "iOS 系统通知点脉动 / 心跳监护仪视觉",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-editorial", "content-pullQuote"],
  conflicts_with: [],
  alternatives: ["icon-quoteOpen"],
  visual_weight: "light",
  z_layer: "foreground",
  mood: ["calm", "warm"],
  tags: ["motion", "heart", "pulse", "loop", "decoration"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    color: { type: "color", default: "#c45a3c", semantic: "心形填充色" },
    duration: { type: "number", default: 2, semantic: "一个 pulse 周期时长" },
  },
  enter: null,
  exit: null,
  render(_host, _t, params, _vp) {
    const color = params.color || "#c45a3c";
    const duration = Number(params.duration) || 2;
    return {
      duration,
      size: [400, 400],
      layers: [
        {
          type: "shape",
          shape: "heart",
          at: [200, 200],
          size: 180,
          fill: color,
          behavior: "pulse",
          startAt: 0,
          duration,
        },
      ],
    };
  },
  describe(t, params, vp) {
    return { sceneId: "heartThrob", phase: "pulsing", progress: (t % 2) / 2, visible: true, params, viewport: vp };
  },
  sample() {
    return { color: "#c45a3c", duration: 2 };
  },
};
