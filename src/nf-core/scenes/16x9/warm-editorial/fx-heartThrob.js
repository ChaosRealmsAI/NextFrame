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
  type: "dom",
  frame_pure: false,
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
  render(host, t, params, _vp) {
    const color = params.color || "#c45a3c";
    const duration = Number(params.duration) || 2;
    const p = loop01(t, duration);
    const breathe = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
    const scale = 1.8 * (0.8 + 0.3 * breathe);
    const opacity = 0.6 + 0.4 * breathe;
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%" style="position:absolute;inset:0;display:block"><g transform="translate(200 200) scale(${scale.toFixed(3)})" opacity="${opacity.toFixed(3)}"><path d="${HEART_PATH}" fill="${escapeAttr(color)}"/></g></svg>`;
  },
  describe(t, params, vp) {
    return { sceneId: "heartThrob", phase: "pulsing", progress: (t % 2) / 2, visible: true, params, viewport: vp };
  },
  sample() {
    return { color: "#c45a3c", duration: 2 };
  },
};

const HEART_PATH = "M0,-15C0,-40 -30,-55 -55,-45C-85,-30 -90,10 -60,35C-30,55 -5,65 0,75C5,65 30,55 60,35C90,10 85,-30 55,-45C30,-55 0,-40 0,-15Z";

function loop01(t, duration) {
  const d = Math.max(0.001, Number(duration) || 1);
  return ((t % d) + d) % d / d;
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
