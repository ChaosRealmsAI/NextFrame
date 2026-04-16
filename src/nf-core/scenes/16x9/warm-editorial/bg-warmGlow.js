// scenes/16x9/warm-editorial/bg-warmGlow.js
//
// warmGlow — 暖光渐变 vignette，中心 #f7f3ec 边缘 #e3ddd3，微弱光晕随 t 呼吸

export default {
  // ===== Identity =====
  id: "warmGlow",
  name: "Warm Glow",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "warm-editorial",
  role: "bg",

  // ===== Semantics =====
  description: "暖光渐变 vignette — 中心米白边缘暖灰，柔和径向渐变 + 微弱光晕随 t 呼吸",
  duration_hint: null,

  // ===== Render type =====
  type: "shader",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI understanding layer =====
  // ========================================

  intent: `paperGrain 是"纸"，warmGlow 是"灯"。深夜书房的画面核心不是纸本身，而是台灯打下来的那个暖黄光圈 — 中心最亮（#f7f3ec 米白），向边缘自然衰减到 #e3ddd3（暖灰），像真实台灯的径向光照。光晕不是死的，它有极缓慢的呼吸（8 秒一周期，振幅仅 2%），模拟灯泡微弱的功率波动。第二层是更大半径的暖橙微光，相位错开（12 秒周期），两层叠加后光圈边缘不是简单圆形而是有机的椭圆。视觉上"不刻意"是核心标准 — 观众只觉得画面温暖，不会注意到光在动。适合长时间静置的内容页。`,

  when_to_use: [
    "需要比 paperGrain 更有温度感、更有灯光氛围的底色",
    "内容页/正文页/引用页等需要长时间阅读的场景",
    "封面或章节页配合 text-chapterTitle 时提供舞台感",
  ],

  when_not_to_use: [
    "已经有 paperGrain 或 linenTexture — 不要叠两层底",
    "需要均匀光照的数据图表场景（vignette 会干扰边缘数据的可读性）",
    "暗色模式场景（这是亮底组件）",
  ],

  limitations: [
    "呼吸幅度极小（2%），近看才能察觉",
    "中心偏上（y=42%），不是正中心 — 配合内容区域的视觉重心",
    "边缘不会暗到 #d0c8bc 以下，始终保持亮底调性",
  ],

  inspired_by: "深夜书房的台灯光圈 + 锵锵三人行片头的暖色灯光 + Monocle 杂志封面的自然暖光照",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["dustMotes", "content-editorial", "content-pullQuote", "text-chapterTitle", "chrome-bookSpine"],
  conflicts_with: ["paperGrain", "linenTexture"],
  alternatives: ["paperGrain", "linenTexture"],

  // ===== Visual weight =====
  visual_weight: "light",
  z_layer: "background",
  mood: ["warm", "calm", "intimate", "literary"],

  // ===== Index =====
  tags: ["warmGlow", "bg", "shader", "vignette", "glow", "warm", "light", "warm-editorial", "暖光", "渐变"],

  // ===== Engineering =====
  complexity: "simple",
  performance: { cost: "low", notes: "单 pass fragment shader；纯数学渐变无采样" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial shader — warm glow vignette for editorial theme" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    breathe: {
      type: "number",
      default: 1.0,
      semantic: "呼吸强度倍率，0 = 静止，1 = 默认，2 = 明显",
    },
    centerY: {
      type: "number",
      default: 0.42,
      semantic: "光圈中心 Y 位置（0-1），默认偏上配合阅读区",
    },
  },

  // ===== Animation hooks =====
  enter: null,
  exit: null,

  // ========================================
  // ===== 3 functions =====
  // ========================================

  render(host, _t, params, _vp) {
    void host;
    const breathe = num(params.breathe, 1.0);
    const centerY = num(params.centerY, 0.42);
    return {
      frag: `
        precision highp float;
        uniform float uT;
        uniform vec2 uR;
        uniform float uBreathe;
        uniform float uCenterY;

        // smooth hash noise for organic wobble
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uR.xy;
          float aspect = uR.x / uR.y;

          // center point (slightly above middle)
          vec2 center = vec2(0.5, uCenterY);
          vec2 d = (uv - center) * vec2(aspect, 1.0);

          // two breathing layers with offset periods
          float b1 = 1.0 + uBreathe * 0.02 * sin(uT * 0.7854);   // ~8s period
          float b2 = 1.0 + uBreathe * 0.015 * sin(uT * 0.5236 + 1.8); // ~12s period

          // primary radial falloff
          float dist1 = length(d) * b1;
          float falloff1 = smoothstep(0.0, 1.2, dist1);

          // secondary wider warm halo (elliptical, wider than tall)
          vec2 d2 = d * vec2(0.8, 1.1);
          float dist2 = length(d2) * b2;
          float falloff2 = smoothstep(0.0, 1.5, dist2);

          // micro-wobble at the edge — makes the circle organic
          float wobble = vnoise(uv * 4.0 + uT * 0.03) * 0.02;

          // colors from theme.md
          vec3 paperCenter = vec3(0.969, 0.953, 0.925);  // #f7f3ec
          vec3 paperEdge   = vec3(0.890, 0.867, 0.827);  // #e3ddd3
          vec3 warmTint    = vec3(0.933, 0.898, 0.843);  // warm mid-tone

          // blend: center → warm mid → edge
          vec3 color = mix(paperCenter, warmTint, falloff1 + wobble);
          color = mix(color, paperEdge, falloff2 * 0.6);

          // subtle warm highlight at center
          float highlight = exp(-dist1 * dist1 * 3.0) * 0.03 * b1;
          color += vec3(0.02, 0.015, 0.005) * highlight;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uBreathe: breathe,
        uCenterY: centerY,
      },
      fallback_gradient: "radial-gradient(ellipse 80% 70% at 50% 42%, #f7f3ec 0%, #ede8df 50%, #e3ddd3 100%)",
    };
  },

  describe(t, params, vp) {
    const breathe = num(params.breathe, 1.0);
    const b1 = 1.0 + breathe * 0.02 * Math.sin(t * 0.7854);
    return {
      sceneId: "warmGlow",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "shader-field", role: "background", style: "warm-vignette" },
        { type: "glow", role: "center-light", color: "#f7f3ec", breatheMultiplier: Number(b1.toFixed(3)) },
        { type: "vignette", role: "edge-darken", color: "#e3ddd3" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      breathe: 1.0,
      centerY: 0.42,
    };
  },
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
