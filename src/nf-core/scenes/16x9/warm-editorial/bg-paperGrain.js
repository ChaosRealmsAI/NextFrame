// scenes/16x9/warm-editorial/bg-paperGrain.js
//
// paperGrain — 米白底 + 极淡纸质颗粒 GLSL noise，暖色调深夜书房质感

export default {
  // ===== Identity =====
  id: "paperGrain",
  name: "Paper Grain",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "warm-editorial",
  role: "bg",

  // ===== Semantics =====
  description: "米白底 + 极淡纸质颗粒 GLSL noise — 模拟高档杂志纸张的微观纹理",
  duration_hint: null,

  // ===== Render type =====
  type: "shader",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI understanding layer =====
  // ========================================

  intent: `纯色底太死气 — #f7f3ec 米白如果一点纹理都没有，像 PowerPoint 而不像 Monocle 杂志。真实纸张在微观下有纤维颗粒，肉眼看不出但"感觉得到"。这个 shader 在 #f7f3ec 上叠一层 hash noise grain，alpha 控制在 0.03 以下，确保看不出颗粒但画面不"塑料"。grain 随时间微弱漂移（每秒换一帧 seed），给画面生命感但不分散注意力。暖色调：grain 的颜色偏棕（不是灰），和米白底保持同色系。整个 shader 是"看不见的好背景"——观众不会注意到它，但换成纯色立刻觉得廉价。`,

  when_to_use: [
    "所有 warm-editorial 场景的最底层背景",
    "需要纸质感/杂志感/人文气质的静止或慢推镜头",
    "内容层有大量文字时，纸质底比纯色底更舒适",
  ],

  when_not_to_use: [
    "已经有 bg-linenTexture 或 bg-warmGlow 作为底层（不要叠两层纹理底）",
    "需要强视觉冲击的 Hook 帧（这个太安静了）",
  ],

  limitations: [
    "grain alpha 极低（< 0.04），录制到 1080p 后几乎不可见但确实在",
    "不适合暗色模式 — 暗底上的浅色 grain 会变成灰蒙蒙",
    "无可调参数 — 故意的，保持全集视觉一致",
  ],

  inspired_by: "Monocle 杂志纸质感 + 豆瓣读书配色 + 高档书店灯下白纸的温度",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["dustMotes", "content-editorial", "content-pullQuote", "text-chapterTitle", "chrome-bookSpine"],
  conflicts_with: ["linenTexture", "warmGlow"],
  alternatives: ["linenTexture", "warmGlow"],

  // ===== Visual weight =====
  visual_weight: "light",
  z_layer: "background",
  mood: ["calm", "literary", "warm", "quiet"],

  // ===== Index =====
  tags: ["paperGrain", "bg", "shader", "paper", "grain", "noise", "texture", "warm-editorial", "米白", "纸质"],

  // ===== Engineering =====
  complexity: "simple",
  performance: { cost: "low", notes: "单 pass fragment shader；hash noise 无 texture 采样" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial shader — warm paper grain for editorial theme" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    intensity: {
      type: "number",
      default: 0.03,
      semantic: "grain 强度（alpha），建议 0.01-0.05",
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
    const intensity = num(params.intensity, 0.03);
    return {
      frag: `
        precision highp float;
        uniform float uT;
        uniform vec2 uR;
        uniform float uIntensity;

        // --- hash-based noise (no texture dependency) ---
        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float hash13(vec3 p3) {
          p3 = fract(p3 * 0.1031);
          p3 += dot(p3, p3.zyx + 31.32);
          return fract((p3.x + p3.y) * p3.z);
        }

        // --- value noise with smooth interpolation ---
        float vnoise(vec2 p, float seed) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);  // smoothstep

          float a = hash13(vec3(i, seed));
          float b = hash13(vec3(i + vec2(1.0, 0.0), seed));
          float c = hash13(vec3(i + vec2(0.0, 1.0), seed));
          float d = hash13(vec3(i + vec2(1.0, 1.0), seed));

          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uR.xy;
          vec2 px = gl_FragCoord.xy;

          // base paper color: #f7f3ec
          vec3 paper = vec3(0.969, 0.953, 0.925);

          // seed drifts slowly — one grain pattern per ~0.5s
          float seed = floor(uT * 2.0);

          // multi-scale grain: coarse fibers + fine dust
          float coarse = vnoise(px * 0.15, seed) * 0.6;
          float fine = hash12(px + seed * 17.31) * 0.4;
          float grain = coarse + fine;

          // warm tint: grain leans brown (#2c2418) not gray
          vec3 grainColor = vec3(0.173, 0.141, 0.094);

          // subtle vignette to darken edges slightly
          vec2 vig = uv - 0.5;
          float vignette = 1.0 - dot(vig, vig) * 0.15;

          // composite: paper + grain overlay at very low alpha
          vec3 color = paper * vignette;
          color = mix(color, grainColor, grain * uIntensity);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uIntensity: intensity,
      },
      fallback_gradient: "linear-gradient(180deg, #f7f3ec 0%, #f2ede5 100%)",
    };
  },

  describe(_t, params, vp) {
    return {
      sceneId: "paperGrain",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "shader-field", role: "background", style: "paper-grain" },
        { type: "base-color", role: "paper", color: "#f7f3ec" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      intensity: 0.03,
    };
  },
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
