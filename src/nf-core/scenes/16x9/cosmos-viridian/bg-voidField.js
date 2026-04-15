// scenes/16x9/cosmos-viridian/bg-voidField.js
//
// voidField — 深靛紫夜幕 + 双辉光 + 呼吸星点网格 + 一条缓慢扫描微光

export default {
  // ===== Identity =====
  id: "voidField",
  name: "voidField",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "cosmos-viridian",
  role: "bg",

  // ===== Semantics =====
  description: "宇宙主题地基 — 深靛紫底 + 左上翠青辉光 + 右下辉光紫 + 星点呼吸 + 缓慢水平扫描微光",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: false,
  assets: [],

  // ========================================
  // ===== AI understanding layer =====
  // ========================================

  intent: `科普宇宙视频的背景不能纯黑，纯黑像播放器加载中。深靛紫 #0a0b1e 给"深空"语义，比黑多一丝希望。两个径向辉光一冷（翠青左上）一暖（辉光紫右下）不对等 — 镜头的眼睛自然被吸到左上黑洞位，右下留给品牌/字幕的空间不抢戏。星点走 radial-gradient 点阵模拟深空 CCD 观测图，整体 opacity 在 0.35↔0.55 做 5s 周期 sin 波呼吸（银河闪烁的慢节奏）。最慢的动画是一条水平微光扫描线 12s 一个周期，极淡（opacity 0.12），观众看不出来但画面就是"活的"不死气。单帧静止 > 3s 观众划走，bg 这层永远在动。参考 Kurzgesagt 黑洞封面的紫绿撞色 + Webb 色调映射。情绪：好奇 + 敬畏 + 希望，不恐怖不冷漠。`,

  when_to_use: [
    "所有 16:9 cosmos-viridian 场景的最底层",
    "黑洞 / 量子 / 深空 / 粒子物理 / 前沿物理题材的镜头底色",
    "任何需要宇宙观测站氛围的静止或慢推镜头",
  ],

  when_not_to_use: [
    "需要白底极简排版（用其他主题）",
    "强冲击 Hook 帧（用 data-cosmicCounter 或 text-aweQuote 覆盖时 bg 仍保留）",
    "纯数据图表类严肃报告（用 data-pop 或 matte-carbon 主题）",
  ],

  limitations: [
    "无 params 可调 — 一个视频里保持视觉一致",
    "呼吸幅度故意小（0.2 的 opacity），近看才明显",
    "径向辉光位置写死 20/15 和 82/85（%）— 配合内容构图",
  ],

  inspired_by: "Kurzgesagt 黑洞系列封面 + Event Horizon Telescope 深紫观测照 + Webb 色调映射",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["data-cosmicCounter", "content-orbitDiagram", "content-formulaReveal", "text-aweQuote", "chrome-observatoryBar"],
  conflicts_with: [],
  alternatives: [],

  // ===== Visual weight =====
  visual_weight: "low",
  z_layer: "background",
  mood: ["focused", "night", "scientific", "hopeful"],

  // ===== Index =====
  tags: ["bg", "cosmos", "space", "viridian", "indigo", "void", "star-field", "cosmos-viridian"],

  // ===== Engineering =====
  complexity: "simple",
  performance: { cost: "low", notes: "4 层 div + 2 个 t-driven 值（breathe opacity + scanX）；无重排" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for cosmos-viridian · E01 黑洞视界悖论" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {},

  // ===== Animation hooks =====
  enter: null,
  exit: null,

  // ========================================
  // ===== 3 functions =====
  // ========================================

  render(host, t, _params, vp) {
    // breathe: 星点 opacity 0.35↔0.55，周期 5s（verb 1: breathe）
    const breathe = 0.45 + 0.10 * Math.sin((t / 5) * Math.PI * 2);

    // scan: 水平微光扫描，从 -20% → 120%，周期 12s（verb 2: sweep / reveal）
    const scanCycle = (t % 12) / 12;
    const scanX = -20 + scanCycle * 140; // %

    // 辉光脉冲：左上翠青辉光 opacity 0.06↔0.10，周期 7s，相位错开（pulse）
    const glowA = 0.08 + 0.02 * Math.sin((t / 7) * Math.PI * 2 + 1.2);
    const glowB = 0.05 + 0.02 * Math.sin((t / 9) * Math.PI * 2);

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 60% 55% at 18% 22%, rgba(61,220,151,${glowA.toFixed(3)}) 0%, transparent 58%),
          radial-gradient(ellipse 55% 50% at 82% 82%, rgba(185,103,255,${glowB.toFixed(3)}) 0%, transparent 60%),
          radial-gradient(ellipse 95% 70% at 50% 50%, #12132a 0%, #0a0b1e 70%);
      "></div>

      <div style="
        position: absolute;
        inset: 0;
        background-image:
          radial-gradient(circle at 12% 18%, rgba(255,251,214,${(breathe*0.9).toFixed(3)}) 1px, transparent 1.5px),
          radial-gradient(circle at 34% 62%, rgba(255,251,214,${(breathe*0.6).toFixed(3)}) 1px, transparent 1.5px),
          radial-gradient(circle at 58% 28%, rgba(255,251,214,${(breathe*0.8).toFixed(3)}) 1px, transparent 1.5px),
          radial-gradient(circle at 74% 72%, rgba(255,251,214,${(breathe*0.5).toFixed(3)}) 1px, transparent 1.5px),
          radial-gradient(circle at 88% 12%, rgba(255,251,214,${(breathe*0.9).toFixed(3)}) 1px, transparent 1.5px),
          radial-gradient(circle at 22% 88%, rgba(255,251,214,${(breathe*0.4).toFixed(3)}) 1px, transparent 1.5px),
          radial-gradient(circle at 46% 8%, rgba(234,244,242,${(breathe*0.3).toFixed(3)}) 1px, transparent 1.5px),
          radial-gradient(circle at 66% 92%, rgba(234,244,242,${(breathe*0.35).toFixed(3)}) 1px, transparent 1.5px);
        background-size: ${W*0.5}px ${H*0.5}px, ${W*0.4}px ${H*0.4}px, ${W*0.6}px ${H*0.6}px, ${W*0.45}px ${H*0.45}px, ${W*0.55}px ${H*0.55}px, ${W*0.5}px ${H*0.5}px, ${W*0.7}px ${H*0.7}px, ${W*0.35}px ${H*0.35}px;
      "></div>

      <div style="
        position: absolute;
        top: 0; bottom: 0;
        left: ${scanX.toFixed(2)}%;
        width: ${W*0.18}px;
        background: linear-gradient(to right,
          transparent 0%,
          rgba(61,220,151,0.05) 45%,
          rgba(61,220,151,0.12) 50%,
          rgba(61,220,151,0.05) 55%,
          transparent 100%);
        mix-blend-mode: screen;
        pointer-events: none;
      "></div>

      <div style="
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(to right, rgba(234,244,242,0.025) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(234,244,242,0.025) 1px, transparent 1px);
        background-size: ${W*0.0625}px ${W*0.0625}px;
      "></div>
    `;
  },

  describe(t, _params, vp) {
    const breathe = 0.45 + 0.10 * Math.sin((t / 5) * Math.PI * 2);
    return {
      sceneId: "voidField",
      phase: "show",
      progress: 1,
      visible: true,
      params: {},
      elements: [
        { type: "void", role: "bg-base", color: "#0a0b1e" },
        { type: "glow", role: "bg-glow", position: "top-left", color: "#3ddc97" },
        { type: "glow", role: "bg-glow", position: "bottom-right", color: "#b967ff" },
        { type: "stars", role: "bg-stars", breatheOpacity: Number(breathe.toFixed(3)) },
        { type: "scan", role: "bg-sweep", cycle: 12 },
        { type: "grid", role: "bg-grid", faint: true },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {};
  },
};
