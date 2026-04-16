// scenes/16x9/effects-showcase/bg-liquidNoise.js
//
// liquidNoise — SVG feTurbulence + feDisplacementMap 液态扭曲噪点背景
// 真正的电影级背景：不是渐变，是被「水」扭过的颜色。t-driven baseFrequency 流动。

export default {
  // ===== Identity =====
  id: "liquidNoise",
  name: "liquidNoise",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "effects-showcase",
  role: "bg",

  // ===== Semantics =====
  description: "SVG feTurbulence + feDisplacementMap 液态扭曲噪点 — 像被水浸过的霓虹油画，t-driven 流动",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: false,
  assets: [],

  // ========================================
  // ===== AI understanding layer =====
  // ========================================

  intent: `普通渐变背景已经被用烂了，Awwwards 顶部 30% 的网站全在用 SVG turbulence 做液态噪点 — 它的核心是 feTurbulence 生成 perlin 噪声，再用 feDisplacementMap 把噪声当 UV 偏移，去扭曲下层的渐变，结果是一张「会呼吸的油画」。我让 baseFrequency 在 0.008↔0.014 之间走 8 秒正弦波，scale 在 80↔140 走 11 秒正弦波（错位周期防止画面进入循环节拍），输出就是「液体被慢慢搅动」的电影感。底色是 #05060a 真黑 + 三个霓虹径向光斑（cyan / magenta / violet），扭过之后边界变成羽毛状，绝不是 Photoshop 渐变能给的。情绪节点：作为 Hook 帧底色让观众第一秒就「这玩意儿不一般」。情绪波形里属于 0-3s 的视觉冲击底层。`,

  when_to_use: [
    "需要电影质感的开场底色",
    "shader / 神经渲染 / 生成式视觉类话题",
    "想让观众第一秒就觉得「不一般」的 Hook",
  ],

  when_not_to_use: [
    "需要稳定阅读的长文本场景（噪声会分散注意力）",
    "数据图表场景（背景太活会抢戏，用 bg2 实色）",
  ],

  limitations: [
    "feTurbulence 在低端 GPU 略慢，1080p 录制无问题",
    "displacement scale > 200 时边缘出血明显",
  ],

  inspired_by: "Bruno Simon 个人站 + Linear changelog 头图 + Awwwards SOTD turbulence 流派",
  used_in: [],

  requires: [],
  pairs_well_with: ["text-neonGlow", "data-bigStat", "content-particleField"],
  conflicts_with: [],
  alternatives: ["bg-warmGradient"],

  visual_weight: "low",
  z_layer: "background",
  mood: ["cinematic", "futuristic", "liquid", "haunting"],

  tags: ["bg", "noise", "turbulence", "liquid", "displacement", "effects-showcase"],

  complexity: "medium",
  performance: { cost: "medium", notes: "feTurbulence + feDisplacementMap 每帧重算；1080p OK，4k 略卡" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — SVG liquid noise hero bg" },
  ],

  params: {},

  enter: null,
  exit: null,

  // ========================================
  // ===== render =====
  // ========================================

  render(host, t, _params, vp) {
    const W = vp.width;
    const H = vp.height;

    // 错位周期：baseFrequency 8s，scale 11s
    const freq = 0.011 + 0.003 * Math.sin((t / 8) * Math.PI * 2);
    const scale = 110 + 30 * Math.sin((t / 11) * Math.PI * 2);
    // seed 缓慢漂移 — 让噪声本体也演化（否则只是同一张图被扭）
    const seed = Math.floor(t * 3) % 100;

    // 三个霓虹光斑相位错开
    const cyanY = 30 + 10 * Math.sin((t / 7) * Math.PI * 2);
    const magX = 70 + 8 * Math.sin((t / 9) * Math.PI * 2 + 1.4);
    const violetY = 75 + 12 * Math.sin((t / 13) * Math.PI * 2);

    host.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;display:block;">
        <defs>
          <filter id="liquid" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse">
            <feTurbulence type="fractalNoise" baseFrequency="${freq.toFixed(5)}" numOctaves="3" seed="${seed}" result="noise"/>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="${scale.toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/>
            <feGaussianBlur stdDeviation="1.5"/>
          </filter>

          <radialGradient id="g-cyan" cx="22%" cy="${cyanY}%" r="55%">
            <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#00f0ff" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="g-mag" cx="${magX}%" cy="32%" r="50%">
            <stop offset="0%" stop-color="#ff2bd6" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#ff2bd6" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="g-violet" cx="62%" cy="${violetY}%" r="60%">
            <stop offset="0%" stop-color="#7c4dff" stop-opacity="0.50"/>
            <stop offset="100%" stop-color="#7c4dff" stop-opacity="0"/>
          </radialGradient>
        </defs>

        <rect width="${W}" height="${H}" fill="#05060a"/>
        <g filter="url(#liquid)">
          <rect width="${W}" height="${H}" fill="url(#g-violet)"/>
          <rect width="${W}" height="${H}" fill="url(#g-cyan)"/>
          <rect width="${W}" height="${H}" fill="url(#g-mag)"/>
        </g>

        <!-- 顶部暗角 -->
        <rect width="${W}" height="${H}" fill="url(#vignette)"/>
        <defs>
          <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
            <stop offset="50%" stop-color="#000" stop-opacity="0"/>
            <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
          </radialGradient>
        </defs>
      </svg>
    `;
  },

  describe(t, _params, vp) {
    return {
      sceneId: "liquidNoise",
      phase: "show",
      progress: 1,
      visible: true,
      params: {},
      elements: [
        { type: "bg", role: "base", color: "#05060a" },
        { type: "glow", color: "#00f0ff", position: "left" },
        { type: "glow", color: "#ff2bd6", position: "top-right" },
        { type: "glow", color: "#7c4dff", position: "center-bottom" },
        { type: "filter", role: "displacement", baseFrequency: Number((0.011 + 0.003 * Math.sin((t / 8) * Math.PI * 2)).toFixed(5)) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {};
  },
};
