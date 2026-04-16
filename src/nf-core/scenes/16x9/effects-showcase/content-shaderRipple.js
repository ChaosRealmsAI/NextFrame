// scenes/16x9/effects-showcase/content-shaderRipple.js
//
// shaderRipple — SVG turbulence + displacement 模拟 shader 水波扭曲
// 一个霓虹方块被「水波 shader」实时扭曲，t-driven baseFrequency 高频脉冲。

export default {
  id: "shaderRipple",
  name: "shaderRipple",
  version: "1.0.0",

  ratio: "16:9",
  theme: "effects-showcase",
  role: "content",

  description: "SVG turbulence baseFrequency 高频 t-driven 模拟 shader 水波扭曲 — 中心一个霓虹方块被实时折射",
  duration_hint: null,

  type: "svg",
  frame_pure: false,
  assets: [],

  intent: `这是「假 shader」— 真 shader 要 WebGL，但 SVG feTurbulence + feDisplacementMap 能给 80% 的视觉效果且零依赖。中心一个 cyan→magenta 渐变方块，外面套一个高频 turbulence（baseFrequency 0.04↔0.09 走 3s 周期，比 bg 快 3 倍 → 表达「能量更集中」），displacement scale 在 14↔32 走 4.5s 周期，结果是方块边缘像被透过水面看一样不停折射。再叠一层旋转的 conic-gradient 描边制造「shader pass」感。intent 字段强调：这个组件用来讲「shader / 神经渲染」原理时做主角，不是装饰。情绪节点：高潮段（15-25s 核心论点），观众盯着方块时画面就是「shader 在你眼前跑」。`,

  when_to_use: [
    "讲 shader / WebGL / 神经渲染 / 折射光学时的主视觉",
    "需要展示「实时扭曲」概念的 hero 元素",
    "情绪波形高潮段，盯着一个东西看的镜头",
  ],

  when_not_to_use: [
    "需要清晰可读文字的镜头（扭曲会把字搅烂）",
    "低端设备目标（feTurbulence 高频 + 大 scale 较吃 CPU）",
  ],

  limitations: [
    "displacement scale > 40 内容认不出来",
    "中心方块写死 480x480 设计基准",
  ],

  inspired_by: "Three.js shader 演示 + Codrops 水波折射 demo + Codepen #shader trending",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-liquidNoise", "text-neonGlow"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["futuristic", "energetic", "technical"],

  tags: ["content", "shader", "ripple", "turbulence", "displacement", "effects-showcase"],

  complexity: "medium",
  performance: { cost: "medium", notes: "高频 turbulence + displacement 比 bg-liquidNoise 略重" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — fake shader via SVG filter" },
  ],

  params: {
    label: {
      type: "string",
      default: "SHADER://RIPPLE.glsl",
      semantic: "中心方块顶部 mono 标签，伪代码味",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const cx = W / 2;
    const cy = H / 2;

    // 中心方块尺寸
    const size = Math.min(W, H) * 0.42;

    // 入场：scale 从 0.7 弹到 1，0.7s
    const enterDur = 0.7;
    const ep = Math.min(t / enterDur, 1);
    const easedEnter = 1 - Math.pow(1 - ep, 3);
    const overshoot = ep < 1 ? (easedEnter * 1.08) : 1;
    const opacity = easedEnter;

    // shader 参数高频脉冲
    const freq = 0.06 + 0.025 * Math.sin((t / 3) * Math.PI * 2);
    const dispScale = 23 + 9 * Math.sin((t / 4.5) * Math.PI * 2);
    const seed = Math.floor(t * 12) % 200;

    // 旋转描边
    const rot = (t * 30) % 360;

    // 文字呼吸
    const labelOpacity = 0.6 + 0.3 * Math.sin((t / 2) * Math.PI * 2);

    const label = String(params.label || "SHADER://RIPPLE.glsl");
    const safeLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    host.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;display:block;opacity:${opacity.toFixed(3)};">
        <defs>
          <filter id="ripple" x="-15%" y="-15%" width="130%" height="130%" filterUnits="userSpaceOnUse">
            <feTurbulence type="turbulence" baseFrequency="${freq.toFixed(5)}" numOctaves="2" seed="${seed}" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="${dispScale.toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/>
          </filter>

          <linearGradient id="cube" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#00f0ff"/>
            <stop offset="50%" stop-color="#7c4dff"/>
            <stop offset="100%" stop-color="#ff2bd6"/>
          </linearGradient>

          <linearGradient id="cubeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="#ff2bd6" stop-opacity="0.6"/>
          </linearGradient>

          <filter id="glowSoft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="22"/>
          </filter>
        </defs>

        <!-- 外辉光 -->
        <rect x="${cx - size/2}" y="${cy - size/2}" width="${size}" height="${size}"
              fill="url(#cubeGlow)" filter="url(#glowSoft)" opacity="0.55"
              transform="scale(${overshoot.toFixed(3)}) translate(${(cx*(1-overshoot)/overshoot).toFixed(2)} ${(cy*(1-overshoot)/overshoot).toFixed(2)})"/>

        <!-- 旋转描边轨道 -->
        <g transform="rotate(${rot.toFixed(2)} ${cx} ${cy})">
          <rect x="${cx - size/2 - 28}" y="${cy - size/2 - 28}" width="${size + 56}" height="${size + 56}"
                fill="none" stroke="#00f0ff" stroke-opacity="0.35" stroke-width="1.5"
                stroke-dasharray="8 14"/>
        </g>

        <!-- shader 方块（被 ripple 扭曲）-->
        <g filter="url(#ripple)">
          <rect x="${cx - size/2}" y="${cy - size/2}" width="${size}" height="${size}"
                fill="url(#cube)" rx="8"
                transform="scale(${overshoot.toFixed(3)}) translate(${(cx*(1-overshoot)/overshoot).toFixed(2)} ${(cy*(1-overshoot)/overshoot).toFixed(2)})"/>
        </g>

        <!-- 顶部 mono 标签 -->
        <text x="${cx}" y="${cy - size/2 - 56}" text-anchor="middle"
              font-family="'SF Mono', 'JetBrains Mono', Consolas, monospace"
              font-size="18" fill="#00f0ff" opacity="${labelOpacity.toFixed(3)}"
              letter-spacing="2">
          ${safeLabel}
        </text>

        <!-- 底部参数读数 -->
        <text x="${cx}" y="${cy + size/2 + 64}" text-anchor="middle"
              font-family="'SF Mono', 'JetBrains Mono', Consolas, monospace"
              font-size="16" fill="rgba(234,242,255,0.5)"
              letter-spacing="1.5">
          baseFreq=${freq.toFixed(4)}  scale=${dispScale.toFixed(1)}
        </text>
      </svg>
    `;
  },

  describe(t, params, vp) {
    return {
      sceneId: "shaderRipple",
      phase: t < 0.7 ? "enter" : "show",
      progress: Math.min(1, t / 0.7),
      visible: true,
      params,
      elements: [
        { type: "label", role: "kicker", value: params.label || "" },
        { type: "ripple-cube", role: "hero", filter: "ripple" },
        { type: "rotating-frame", role: "decoration" },
      ],
      boundingBox: { x: vp.width * 0.29, y: vp.height * 0.29, w: vp.width * 0.42, h: vp.height * 0.42 },
    };
  },

  sample() {
    return {
      label: "SHADER://NEURAL_RIPPLE.glsl",
    };
  },
};
