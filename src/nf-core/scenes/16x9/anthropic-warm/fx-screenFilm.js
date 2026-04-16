// scenes/16x9/anthropic-warm/fx-screenFilm.js
//
// screenFilm — 透明叠加的屏幕胶片滤镜。

export default {
  id: "screenFilm",
  name: "screenFilm",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "overlay",

  description: "全屏滤镜 — 细颗粒、暗角、轻微色差感，输出透明 alpha 叠加在任意底层之上",
  duration_hint: null,

  type: "shader",
  frame_pure: true,
  assets: [],

  intent: `screenFilm 的目标不是把画面做旧，而是给完全数字化的底图补一层“拍摄感”。它把三件事压到很轻的量级：细颗粒、边缘暗角、几乎察觉不到的暖色通道偏移。这样做的好处是，底层不管是 gradientFlow、noiseField 还是内容卡片，叠上去都会更像真正输出过一层屏幕或镜头，而不是裸 UI。因为 shader 本身输出透明 alpha，所以它可以安全地作为最上层覆盖，不吞底图。`,

  when_to_use: [
    "整期想统一出片质感，让底层组件看起来更像真实成片而不是纯 UI 拼接",
    "背景或内容层过于干净，需要一点颗粒和边缘收束",
    "章节封面、收尾金句、hero 大数字等需要更强的成片味道",
  ],

  when_not_to_use: [
    "画面已经有明显噪点、扫描线或 glitch，再叠 screenFilm 会重复",
    "需要绝对干净、像截图一样锐利的界面镜头",
    "深色小字很多且靠近边缘，暗角会压掉一点可读性",
  ],

  limitations: [
    "这个滤镜不能采样底层画面，所以色差只能用透明 tint 暗示，不能真正做 RGB 分离",
    "grain 太高会脏，建议 0.3..0.9",
    "vignette 只适合做轻收边，不适合当主视觉效果",
  ],

  inspired_by: "数字胶片 LUT 里最轻的一层 screen grain + vignette，以及电影海报的边缘收束",
  used_in: [],

  requires: [],
  pairs_well_with: ["gradientFlow", "noiseField", "rippleWater", "auroraMesh", "goldenClose"],
  conflicts_with: ["glitch"],
  alternatives: [],

  visual_weight: "light",
  z_layer: "front",
  mood: ["calm", "cinematic", "professional"],

  tags: ["screenFilm", "overlay", "shader", "film", "grain", "anthropic-warm", "滤镜", "叠加"],

  complexity: "simple",
  performance: { cost: "low", notes: "单 pass fragment shader；hash grain + vignette + scan tint" },
  status: "beta",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial transparent shader overlay for v0.9 first-party filter set" },
  ],

  params: {
    grain: {
      type: "number",
      default: 0.55,
      semantic: "颗粒强度",
    },
    vignette: {
      type: "number",
      default: 0.75,
      semantic: "边缘暗角强度",
    },
    fringe: {
      type: "number",
      default: 0.45,
      semantic: "暖色通道偏移感强度，只做轻微暗示",
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
        uniform float uGrain;
        uniform float uVignette;
        uniform float uFringe;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uR.xy;
          vec2 centered = (uv - 0.5) * vec2(uR.x / uR.y, 1.0);
          vec2 px = gl_FragCoord.xy;

          float coarse = hash21(floor(px + vec2(floor(uT * 24.0), floor(uT * 13.0))));
          float fine = hash21(px * 1.37 + vec2(uT * 91.3, -uT * 63.7));
          float grain = (coarse * 0.65 + fine * 0.35 - 0.5) * uGrain;

          float scan = sin((uv.y + uT * 0.06) * uR.y * 0.13) * 0.5 + 0.5;
          float edge = clamp(length(centered) * 1.18, 0.0, 1.0);
          float vignette = pow(edge, 2.0) * uVignette;
          float fringe = (
            sin(uv.y * 120.0 + uT * 4.0) +
            sin(uv.x * 90.0 - uT * 3.2)
          ) * 0.5 * uFringe;

          vec3 tint = vec3(
            0.96 + fringe * 0.02,
            0.84 + fringe * 0.05,
            0.72 - fringe * 0.08
          );

          float alpha = 0.05;
          alpha += abs(grain) * 0.16;
          alpha += scan * 0.03;
          alpha += vignette * 0.24;
          alpha = clamp(alpha, 0.0, 0.30);

          vec3 color = tint * (0.26 + scan * 0.22 + grain * 0.25);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      uniforms: {
        uGrain: num(params.grain, 0.55),
        uVignette: num(params.vignette, 0.75),
        uFringe: num(params.fringe, 0.45),
      },
      fallback_gradient: "radial-gradient(circle at center, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 42%, rgba(0,0,0,0.18) 100%)",
    };
  },

  describe(_t, params, vp) {
    return {
      sceneId: "screenFilm",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "shader-overlay", role: "film-grain", alpha: 0.3 },
        { type: "vignette", role: "edge-darken", intensity: num(params.vignette, 0.75) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      grain: 0.55,
      vignette: 0.75,
      fringe: 0.45,
    };
  },
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
