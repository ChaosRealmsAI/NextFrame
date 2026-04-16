// scenes/16x9/anthropic-warm/bg-noiseField.js
//
// noiseField — 内联 simplex noise 的暖棕气氛底。

export default {
  id: "noiseField",
  name: "noiseField",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "bg",

  description: "柏林/单纯形噪声氛围背景 — GLSL 内联 simplex noise，做暖雾感和纸面般的空气层次",
  duration_hint: null,

  type: "shader",
  frame_pure: true,
  assets: [],

  intent: `这个背景解决的是“单纯渐变还是太平”的问题。通过内联 simplex noise 做出像暖雾、纸张纤维和房间空气混在一起的随机层次，画面会比 gradientFlow 更有物理感，但又不像粒子或纹理贴图那样具体。它适合解释性段落里需要一点“环境存在感”的镜头，尤其是 statBig、slotGrid 这种构图硬、文字少、背景可以承担更多气氛的时候。`,

  when_to_use: [
    "想保留 anthropic-warm 的克制感，但需要比普通渐变更丰富的空气层次",
    "大数字、单卡片、单句标题等构图较空的镜头，需要背景补足质感",
    "章节间需要轻微变化，但又不想切到明显不同的视觉世界",
  ],

  when_not_to_use: [
    "需要明确流向或水波感（用 gradientFlow 或 rippleWater 更贴题）",
    "正文极多、对比度要求很高的页面，噪声层会让背景存在感偏强",
    "已经叠了颗粒滤镜，再加会显得脏",
  ],

  limitations: [
    "scale 太高会像脏污贴图，不再像空气层次",
    "warmth 建议 0.7..1.3，过低会冷掉，过高会过橙",
    "这是氛围噪声，不适合作为强节奏镜头的主运动元素",
  ],

  inspired_by: "Perlin cloud background、电影片头里的烟雾底，以及纸面投影的轻颗粒质感",
  used_in: [],

  requires: [],
  pairs_well_with: ["statBig", "slotGrid", "goldenClose", "screenFilm"],
  conflicts_with: ["gradientFlow", "rippleWater", "auroraMesh"],
  alternatives: ["gradientFlow", "rippleWater"],

  visual_weight: "medium",
  z_layer: "back",
  mood: ["calm", "serious", "textured"],

  tags: ["noiseField", "bg", "shader", "simplex", "noise", "anthropic-warm", "氛围", "背景"],

  complexity: "medium",
  performance: { cost: "medium", notes: "单 pass fragment shader；5 octave fbm + simplex noise" },
  status: "beta",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial shader release with inline simplex noise for v0.9" },
  ],

  params: {
    scale: {
      type: "number",
      default: 1,
      semantic: "噪声场尺度，越大越细密",
    },
    speed: {
      type: "number",
      default: 1,
      semantic: "噪声流动速度倍率",
    },
    warmth: {
      type: "number",
      default: 1,
      semantic: "暖橙混色强度，控制画面是偏书房还是偏金雾",
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
        uniform float uScale;
        uniform float uSpeed;
        uniform float uWarmth;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

        float snoise(vec2 v) {
          const vec4 C = vec4(
            0.211324865405187,
            0.366025403784439,
           -0.577350269189626,
            0.024390243902439
          );
          vec2 i = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;

          i = mod289(i);
          vec3 p = permute(
            permute(i.y + vec3(0.0, i1.y, 1.0)) +
            i.x + vec3(0.0, i1.x, 1.0)
          );

          vec3 m = max(
            0.5 - vec3(
              dot(x0, x0),
              dot(x12.xy, x12.xy),
              dot(x12.zw, x12.zw)
            ),
            0.0
          );
          m = m * m;
          m = m * m;

          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

          vec3 g;
          g.x = a0.x * x0.x + h.x * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 m = mat2(1.7, 1.2, -1.2, 1.7);
          for (int i = 0; i < 5; i++) {
            v += a * snoise(p);
            p = m * p + vec2(3.2, -1.7);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uR.xy;
          vec2 p = (uv - 0.5) * vec2(uR.x / uR.y, 1.0);
          float tt = uT * uSpeed * 0.12;

          float n1 = fbm(p * (1.8 + uScale * 1.4) + vec2(tt, -tt * 0.6));
          float n2 = fbm((p + vec2(1.7, -2.3)) * (3.0 + uScale * 1.8) - vec2(tt * 0.7, tt * 0.35));
          float mist = 0.5 + 0.5 * n1;
          float detail = 0.5 + 0.5 * n2;

          vec3 base = vec3(0.08, 0.06, 0.05);
          vec3 amber = vec3(0.85, 0.47, 0.34);
          vec3 parchment = vec3(0.96, 0.92, 0.88);
          vec3 moss = vec3(0.49, 0.56, 0.42);

          vec3 color = base;
          color = mix(color, amber, smoothstep(0.08, 0.85, mist) * 0.55 * uWarmth);
          color = mix(color, moss, smoothstep(0.35, 0.95, detail) * 0.18);
          color += parchment * pow(max(mist * detail, 0.0), 2.8) * 0.07;

          float shadow = smoothstep(1.25, 0.22, length(p + vec2(-0.08, 0.03)));
          color *= mix(0.82, 1.10, shadow);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uScale: num(params.scale, 1),
        uSpeed: num(params.speed, 1),
        uWarmth: num(params.warmth, 1),
      },
      fallback_gradient: "radial-gradient(circle at 24% 22%, rgba(218,119,86,0.12), transparent 34%), radial-gradient(circle at 78% 70%, rgba(126,198,153,0.08), transparent 42%), linear-gradient(135deg, #16120d 0%, #1b1510 54%, #261d15 100%)",
    };
  },

  describe(_t, params, vp) {
    return {
      sceneId: "noiseField",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "shader-field", role: "background", style: "simplex-noise-mist" },
        { type: "warm-fog", role: "atmosphere", warmth: num(params.warmth, 1) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      scale: 1,
      speed: 1,
      warmth: 1.05,
    };
  },
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
