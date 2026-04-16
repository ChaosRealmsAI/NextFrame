// scenes/16x9/anthropic-warm/bg-auroraMesh.js
//
// auroraMesh — 暖色极光 mesh gradient 背景。

export default {
  id: "auroraMesh",
  name: "auroraMesh",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "bg",

  description: "极光 mesh gradient 背景 — 暖橙、金色和少量鼠尾草绿交织成柔软流动幕布",
  duration_hint: null,

  type: "shader",
  frame_pure: true,
  assets: [],

  intent: `auroraMesh 是这组首发里最“hero”的背景。它不是霓虹极光，而是把 mesh gradient 的软团块和 aurora 的垂向幕布运动结合成一层暖色能量场：主色还是 anthopic-warm 的橙、金、深棕，只借一点绿色提鲜，避免全画面都变成一锅橙。它适合章节封面、观点上扬段和收尾前的情绪抬升，因为它有明显空间感和局部高光，但仍然留得住文字。`,

  when_to_use: [
    "章节开场、观点上扬、总结前抬情绪，需要比普通背景更有舞台感",
    "希望画面有明显纵向流动和局部高亮，但整体仍在 warm 主题内",
    "镜头主体是大标题或短句，不怕背景存在感略强",
  ],

  when_not_to_use: [
    "正文很多、信息密度高的解释页，背景会略抢",
    "内容语气需要极度克制、像手册或终端界面（改用 gradientFlow）",
    "已经有 screenFilm + 强内容动效，再叠 aurora 会过满",
  ],

  limitations: [
    "这是强风格背景，不建议和另一层动态背景叠用",
    "glow > 1.4 会让金色区域过亮，浅色正文边缘会被吃掉",
    "绿调只是一点辅色，不能指望它生成真正冷色极光",
  ],

  inspired_by: "mesh gradient 海报、暖色极光摄影，以及带幕布感的生成式背景 shader",
  used_in: [],

  requires: [],
  pairs_well_with: ["goldenClose", "statBig", "screenFilm"],
  conflicts_with: ["gradientFlow", "noiseField", "rippleWater"],
  alternatives: ["gradientFlow", "noiseField"],

  visual_weight: "heavy",
  z_layer: "back",
  mood: ["calm", "intense", "cinematic"],

  tags: ["auroraMesh", "bg", "shader", "mesh", "aurora", "anthropic-warm", "极光", "背景"],

  complexity: "medium",
  performance: { cost: "medium", notes: "单 pass fragment shader；hash noise fbm + curtain bands" },
  status: "beta",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial shader release for warm aurora mesh background" },
  ],

  params: {
    drift: {
      type: "number",
      default: 1,
      semantic: "幕布漂移速度倍率",
    },
    glow: {
      type: "number",
      default: 1,
      semantic: "局部发光强度",
    },
    hue: {
      type: "number",
      default: 0,
      semantic: "暖色层之间的相位偏移",
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
        uniform float uDrift;
        uniform float uGlow;
        uniform float uHue;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);

          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));

          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p = m * p + vec2(2.7, -1.9);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uR.xy;
          vec2 p = (uv - 0.5) * vec2(uR.x / uR.y, 1.0);
          float tt = uT * uDrift * 0.08;

          float warp = fbm(p * 1.4 + vec2(tt, -tt * 0.4));
          float sheet = fbm(vec2(p.x * 1.2 + warp * 0.8, p.y * 2.8 - tt * 1.7));
          float bands = smoothstep(0.08, 0.95, sin(p.y * 4.2 - warp * 1.6 + sheet * 2.4 + tt * 7.0) * 0.5 + 0.5);
          float curtain = smoothstep(0.90, -0.45, p.y) * smoothstep(1.25, 0.12, abs(p.x));
          float sparkle = pow(max(fbm(p * 6.5 + vec2(-tt * 1.7, tt * 1.1)) - 0.45, 0.0), 3.0);

          vec3 night = vec3(0.07, 0.05, 0.04);
          vec3 amber = vec3(0.85, 0.47, 0.34);
          vec3 gold = vec3(0.83, 0.71, 0.52);
          vec3 sage = vec3(0.49, 0.56, 0.42);

          vec3 mesh = mix(amber, gold, 0.5 + 0.5 * sin(warp * 2.5 + uHue));
          mesh = mix(mesh, sage, 0.18 + 0.12 * sin(sheet * 1.7 + uHue * 0.5));

          float intensity = bands * curtain * (0.35 + 0.65 * uGlow) + sparkle * 0.10;
          vec3 color = mix(night, mesh, intensity);
          color += gold * pow(intensity, 2.2) * 0.3;

          float shadow = smoothstep(1.45, 0.10, length(p + vec2(-0.18, -0.06)));
          color *= mix(0.75, 1.12, shadow);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uDrift: num(params.drift, 1),
        uGlow: num(params.glow, 1),
        uHue: num(params.hue, 0),
      },
      fallback_gradient: "radial-gradient(circle at 26% 24%, rgba(218,119,86,0.18), transparent 26%), radial-gradient(circle at 58% 12%, rgba(212,180,131,0.14), transparent 28%), radial-gradient(circle at 74% 36%, rgba(126,198,153,0.10), transparent 26%), linear-gradient(180deg, #0f0c09 0%, #19120d 42%, #221811 100%)",
    };
  },

  describe(_t, params, vp) {
    return {
      sceneId: "auroraMesh",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "shader-field", role: "background", style: "warm-aurora-mesh" },
        { type: "curtain-band", role: "glow", intensity: num(params.glow, 1) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      drift: 1,
      glow: 1.05,
      hue: 0.1,
    };
  },
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
