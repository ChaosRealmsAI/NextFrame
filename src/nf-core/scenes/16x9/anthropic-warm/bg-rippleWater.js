// scenes/16x9/anthropic-warm/bg-rippleWater.js
//
// rippleWater — 多波源暖色水波背景。

export default {
  id: "rippleWater",
  name: "rippleWater",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "bg",

  description: "水波涟漪背景 — 2-3 个波源同时扩散，暖棕底上有柔和金色高光和轻微折射",
  duration_hint: null,

  type: "shader",
  frame_pure: true,
  assets: [],

  intent: `这个组件要给 anthropic-warm 补一个“更有物理介质感”的底。不是蓝色湖面，而是暖茶汤、玻璃杯影子、桌面反光那类更贴近书房语境的水波。设计上固定 3 个波源，允许调用方传 origins 微调重心；波纹本身是扩散 ring，外加一层很轻的 caustic 高光，让它既能做背景运动，又不会抢掉正文可读性。适合讲“影响扩散”“上下文传播”“多源输入叠加”这类概念。`,

  when_to_use: [
    "讲一个输入如何扩散、传播、叠加到系统各处时，背景希望有隐喻支撑",
    "中长镜头需要比 noiseField 更明确的运动方向，但仍然不能喧宾夺主",
    "希望背景有液体、玻璃、茶汤般的暖色反射感",
  ],

  when_not_to_use: [
    "需要完全稳定的背景承托大量正文（用 gradientFlow 更稳）",
    "已经有明显粒子或滤镜层，继续叠会让画面运动来源过多",
    "内容语义偏理性表格或终端，不需要自然介质隐喻",
  ],

  limitations: [
    "origins 用 0..1 归一化坐标；超出这个范围会把波源打到画面外",
    "amplitude > 1.4 会过亮，正文浅色笔画会被高光抬起来",
    "这是 3 波源模型，不适合需要大量干扰点的暴雨/水滴效果",
  ],

  inspired_by: "暖色茶水表面的圆波纹、玻璃折射高光，以及极简 shader 水面 demo",
  used_in: [],

  requires: [],
  pairs_well_with: ["analogyCard", "glossaryCard", "goldenClose", "screenFilm"],
  conflicts_with: ["gradientFlow", "noiseField", "auroraMesh"],
  alternatives: ["gradientFlow", "noiseField"],

  visual_weight: "medium",
  z_layer: "back",
  mood: ["calm", "serious", "organic"],

  tags: ["rippleWater", "bg", "shader", "water", "ripple", "anthropic-warm", "涟漪", "背景"],

  complexity: "medium",
  performance: { cost: "low", notes: "单 pass fragment shader；固定 3 波源 loop + 轻 caustic" },
  status: "beta",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial shader release with configurable ripple origins for v0.9" },
  ],

  params: {
    origins: {
      type: "array",
      default: [[0.24, 0.36], [0.72, 0.42], [0.55, 0.74]],
      semantic: "最多 3 个归一化波源坐标，每个点是 [x, y]",
    },
    amplitude: {
      type: "number",
      default: 1,
      semantic: "波纹与高光强度",
    },
    speed: {
      type: "number",
      default: 1,
      semantic: "扩散速度倍率",
    },
    tint: {
      type: "number",
      default: 1,
      semantic: "暖金色偏移强度",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, _vp) {
    void host; void _vp;
    return {
      frag: `
        precision highp float;
        uniform float uT;
        uniform vec2 uR;
        uniform vec2 uOrigins[3];
        uniform float uAmplitude;
        uniform float uSpeed;
        uniform float uTint;

        void main() {
          vec2 uv = gl_FragCoord.xy / uR.xy;
          vec2 p = (uv - 0.5) * vec2(uR.x / uR.y, 1.0);
          float tt = uT * uSpeed;

          float ripple = 0.0;
          float foam = 0.0;
          for (int i = 0; i < 3; i++) {
            vec2 origin = vec2((uOrigins[i].x - 0.5) * (uR.x / uR.y), uOrigins[i].y - 0.5);
            float d = distance(p, origin);
            float wave = sin(d * 38.0 - tt * (2.6 + float(i) * 0.35));
            float envelope = exp(-d * (4.8 + float(i)));
            ripple += wave * envelope;
            foam += envelope / (1.0 + 28.0 * d * d);
          }

          float shimmer = 0.5 + 0.5 * ripple;
          float caustic = sin((p.x + ripple * 0.03) * 10.0 + tt * 0.22) *
                          sin((p.y - ripple * 0.02) * 14.0 - tt * 0.18);

          vec3 deep = vec3(0.08, 0.06, 0.05);
          vec3 warm = mix(vec3(0.10, 0.08, 0.06), vec3(0.85, 0.47, 0.34), 0.25 + 0.22 * uTint);
          vec3 gold = vec3(0.83, 0.71, 0.52);

          vec3 color = mix(deep, warm, 0.28 + shimmer * 0.24);
          color += gold * pow(max(foam, 0.0), 2.0) * (0.18 + 0.22 * uAmplitude);
          color += vec3(0.06, 0.03, 0.01) * caustic * 0.18 * uAmplitude;

          float vignette = smoothstep(1.35, 0.12, length(p));
          color *= mix(0.70, 1.08, vignette);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uOrigins: flattenOrigins(params.origins),
        uAmplitude: num(params.amplitude, 1),
        uSpeed: num(params.speed, 1),
        uTint: num(params.tint, 1),
      },
      fallback_gradient: "radial-gradient(circle at 24% 36%, rgba(212,180,131,0.16), transparent 18%), radial-gradient(circle at 72% 42%, rgba(218,119,86,0.12), transparent 20%), radial-gradient(circle at 55% 74%, rgba(212,180,131,0.10), transparent 18%), linear-gradient(135deg, #15110c 0%, #1a1510 54%, #231a13 100%)",
    };
  },

  describe(_t, params, vp) {
    return {
      sceneId: "rippleWater",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "shader-field", role: "background", style: "warm-ripple-water" },
        { type: "wave-origins", role: "driver", count: 3 },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      origins: [[0.24, 0.36], [0.72, 0.42], [0.55, 0.74]],
      amplitude: 1,
      speed: 1,
      tint: 1,
    };
  },
};

function flattenOrigins(value) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const pair = Array.isArray(source[i]) ? source[i] : [];
    out.push(num(pair[0], DEFAULT_ORIGINS[i][0]));
    out.push(num(pair[1], DEFAULT_ORIGINS[i][1]));
  }
  return out;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULT_ORIGINS = [
  [0.24, 0.36],
  [0.72, 0.42],
  [0.55, 0.74],
];
