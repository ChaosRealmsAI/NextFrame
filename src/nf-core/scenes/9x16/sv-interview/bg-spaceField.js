// scenes/9x16/sv-interview/bg-spaceField.js

export default {
  id: "spaceField",
  name: "深空蓝背景",
  version: "1.0.0",
  ratio: "9:16",
  theme: "sv-interview",
  role: "bg",
  description: "全屏深空蓝底 + 径向光晕 凌晨书房氛围",
  duration_hint: null,
  type: "dom",
  frame_pure: true,
  assets: [],

  intent: `
    sv-interview 主题的地基。选 #0a0e1a 深空蓝不是纯黑 凌晨刷短视频的观众
    沉浸而不压抑。左上柔光 rgba(77,166,255,0.04) 模拟屏幕边缘反光 给画面温度感。
    低调到几乎感觉不到 但去掉后画面会失去立体感。
  `,
  when_to_use: ["所有 9:16 sv-interview 场景的最底层", "建立深空蓝视觉基调"],
  when_not_to_use: ["需要其他主题时用各自的 bg", "需要动态背景用另造"],
  limitations: ["纯静态 无动画", "颜色写死 无 params 调节"],
  inspired_by: "Kurzgesagt 深色教学背景 + Apple keynote 夜间主题",
  used_in: [],

  requires: [],
  pairs_well_with: ["chrome-sourceBar", "content-videoArea", "chrome-brandFooter"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "low",
  z_layer: "background",
  mood: ["focused", "night"],

  tags: ["background", "space", "dark", "blue", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure CSS 无动画" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版" }],

  params: {},

  enter: null,
  exit: null,

  render(host, _t, _params, _vp) {
    host.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse at 30% 25%, rgba(77,166,255,0.06) 0%, transparent 45%),
          radial-gradient(ellipse at 75% 80%, rgba(240,160,48,0.04) 0%, transparent 50%),
          #0a0e1a;
      "></div>
      <div style="
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.5) 100%);
        pointer-events: none;
      "></div>
    `;
  },

  describe(_t, _params, vp) {
    return {
      sceneId: "spaceField",
      phase: "show",
      progress: 1,
      visible: true,
      params: {},
      elements: [{ type: "bg", role: "base", value: "#0a0e1a" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() { return {}; },
};
