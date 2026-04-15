// scenes/9x16/neo-tokyo/bg-gridPulse.js

export default {
  id: "gridPulse",
  name: "电光青网格呼吸背景",
  version: "1.0.0",
  ratio: "9:16",
  theme: "neo-tokyo",
  role: "bg",
  description: "深夜黑底 + 电光青网格 + 径向光晕 + 呼吸透明度微动 + 顶底垂直扫描线",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `
    neo-tokyo 主题的地基 情绪波形全程都在（非 Hook 时刻作为冷静底）。为什么不纯黑静态
    因为短视频铁律单帧静止>3秒观众划走 背景也要呼吸。做法 网格线透明度 0.06↔0.12
    周期 4s 的 sin 波 + 一条极细扫描线从顶部缓慢下落 8s 一个周期 给画面脉搏感 但不
    抢主体（主强调色 cyan 只在扫描线上亮 0.4 透明度）。径向光晕偏左上 模拟屏幕泛光
    右下留暗部 画面有立体而不是平铺。8% 对角网格是赛博 HUD 的视觉语法 0.06 透明度
    低到几乎看不见 但拿掉会立刻觉得空。情绪基调 科技希望 不是悲观赛博朋克 所以紫色
    只出一丝（右下角 ghost 0.03）不主导 保留给金句层发力。
  `,
  when_to_use: [
    "所有 9:16 neo-tokyo 场景的最底层",
    "建立赛博夜东京视觉基调",
    "任何需要赛博 HUD 氛围的静止镜头",
  ],
  when_not_to_use: [
    "需要暖色氛围（用其他主题）",
    "要强视觉冲击的 Hook 帧（用 content-hookTitle 覆盖）",
  ],
  limitations: [
    "呼吸幅度小 近看才明显 靠累积的节奏感",
    "无 params 可调 一个视频里保持一致",
  ],
  inspired_by: "Blade Runner 2049 夜东京反射 + GitHub dark pro + Fireship 片头",
  used_in: [],

  requires: [],
  pairs_well_with: ["content-hookTitle", "content-counterStat", "content-comparePair", "text-goldenQuote", "overlay-progressPulse"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "low",
  z_layer: "background",
  mood: ["focused", "night", "tech"],

  tags: ["background", "cyber", "dark", "cyan", "grid", "neo-tokyo"],

  complexity: "simple",
  performance: { cost: "low", notes: "单 DOM 树 + 2 个 t-driven 样式值（opacity + translateY）" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版 · neo-tokyo 地基" }],

  params: {},

  enter: null,
  exit: null,

  render(host, t, _params, vp) {
    // 呼吸 breathe：网格 opacity 0.06↔0.12，周期 4s
    const breathe = 0.09 + 0.03 * Math.sin((t / 4) * Math.PI * 2);

    // 扫描线：从 -10% 下落到 110%，周期 8s
    const scanCycle = (t % 8) / 8;
    const scanY = -10 + scanCycle * 120; // %

    // 顶部 HUD 细线从 0 → 100% 宽度淡入（首 0.8s）
    const hudWidth = Math.min(Math.max(t / 0.8, 0), 1);

    const W = vp.width;
    const H = vp.height; void H;

    host.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse at 20% 15%, rgba(0,229,255,0.07) 0%, transparent 48%),
          radial-gradient(ellipse at 85% 88%, rgba(185,103,255,0.04) 0%, transparent 52%),
          #07090f;
      "></div>

      <div style="
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(to right, rgba(0,229,255,${breathe.toFixed(3)}) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0,229,255,${breathe.toFixed(3)}) 1px, transparent 1px);
        background-size: ${W * 0.083}px ${W * 0.083}px;
        mix-blend-mode: screen;
      "></div>

      <div style="
        position: absolute;
        left: 0; right: 0;
        top: ${scanY.toFixed(2)}%;
        height: 2px;
        background: linear-gradient(to right,
          transparent 0%,
          rgba(0,229,255,0.4) 30%,
          rgba(0,229,255,0.5) 50%,
          rgba(0,229,255,0.4) 70%,
          transparent 100%);
        box-shadow: 0 0 12px rgba(0,229,255,0.35);
        pointer-events: none;
      "></div>

      <div style="
        position: absolute;
        left: ${W * 0.08}px;
        top: 70px;
        width: ${(W - W * 0.16) * hudWidth}px;
        height: 1px;
        background: rgba(0,229,255,0.3);
      "></div>

      <div style="
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.55) 100%);
        pointer-events: none;
      "></div>
    `;
  },

  describe(t, _params, vp) {
    const scanCycle = (t % 8) / 8;
    return {
      sceneId: "gridPulse",
      phase: "show",
      progress: 1,
      visible: true,
      params: {},
      elements: [
        { type: "bg", role: "base", value: "#07090f" },
        { type: "grid", role: "texture", color: "#00e5ff", opacity: 0.09 },
        { type: "scan", role: "animation", progress: scanCycle },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {};
  },
};
