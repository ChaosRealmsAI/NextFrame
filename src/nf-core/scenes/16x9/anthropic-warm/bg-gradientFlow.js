// scenes/16x9/anthropic-warm/bg-gradientFlow.js
//
// gradientFlow — 流动暖棕渐变背景，替代静态 linear-gradient。

export default {
  id: "gradientFlow",
  name: "gradientFlow",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "bg",

  description: "流动渐变背景 — sin 波叠加色相偏移，替代平面 linear-gradient 的暖棕书房底板",
  duration_hint: null,

  type: "shader",
  frame_pure: true,
  assets: [],

  intent: `这个背景不是为了炫技，而是为了把 anthropic-warm 从“静态棕色底”推到“有呼吸但不抢戏”的状态。主策略是三层低频 sin 波叠加出缓慢流动的色带，再用一层很轻的暖橙 ridge 做局部提亮，让画面在长镜头里不死。它替代线性渐变的价值在于：同样安静，但镜头停 8-12 秒时仍然有生命感，适合 analogyCard、glossaryCard 这类以文字为主的段落。`,

  when_to_use: [
    "整期视频需要一个稳定、克制、可长时间停留的暖棕底板",
    "文字内容占主体，希望背景只提供温度和层次，不成为主角",
    "章节开场或长解释段，需要比纯色更高级、比 aurora 更安静的动态",
  ],

  when_not_to_use: [
    "需要明确自然材质质感（改用 rippleWater 或 noiseField 更像真实介质）",
    "希望背景存在明显局部运动焦点（改用 auroraMesh）",
    "画面里已经有强闪烁或粒子层，继续叠会让镜头过满",
  ],

  limitations: [
    "这是低频慢动背景，不承担节奏点或强调功能",
    "hue 只建议在 -0.8..0.8 内微调，过大就会偏离 anthropic-warm",
    "contrast 提太高会压暗正文边缘，不适合多段小字密集页面",
  ],

  inspired_by: "Anthropic 官网暖底 hero + 电影海报里几乎察觉不到的彩色流光底板",
  used_in: [],

  requires: [],
  pairs_well_with: ["analogyCard", "glossaryCard", "slotGrid", "statBig", "goldenClose"],
  conflicts_with: ["noiseField", "rippleWater", "auroraMesh"],
  alternatives: ["noiseField", "auroraMesh"],

  visual_weight: "light",
  z_layer: "back",
  mood: ["calm", "serious", "professional"],

  tags: ["gradientFlow", "bg", "shader", "warm", "flow", "anthropic-warm", "渐变", "背景"],

  complexity: "simple",
  performance: { cost: "low", notes: "单 pass fragment shader；主要是 sin 叠加和一次 vignette" },
  status: "beta",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial shader release for v0.9 first-party background set" },
  ],

  params: {
    hue: {
      type: "number",
      default: 0,
      semantic: "整体暖橙偏移，微调章节间的气质差异",
    },
    speed: {
      type: "number",
      default: 1,
      semantic: "流动速度倍率，1 为默认低频慢流",
    },
    contrast: {
      type: "number",
      default: 1,
      semantic: "明暗对比强度，控制背景层次是否更立体",
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
        uniform float uHue;
        uniform float uSpeed;
        uniform float uContrast;

        vec3 palette(float x) {
          vec3 c0 = vec3(0.08, 0.06, 0.05);
          vec3 c1 = vec3(0.85, 0.47, 0.34);
          vec3 c2 = vec3(0.83, 0.71, 0.52);
          vec3 c3 = vec3(0.19, 0.14, 0.10);
          float a = smoothstep(-0.45, 0.85, sin(x + uHue));
          float b = smoothstep(-0.60, 0.90, sin(x * 0.73 - 1.20 - uHue * 0.55));
          vec3 warm = mix(c0, c1, a);
          vec3 gold = mix(c3, c2, b);
          return mix(warm, gold, 0.38 + 0.22 * sin(x * 0.37 - uHue));
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uR.xy;
          vec2 p = (uv - 0.5) * vec2(uR.x / uR.y, 1.0);
          float tt = uT * uSpeed;

          float waveA = sin(p.x * 4.20 + tt * 0.45 + sin(p.y * 2.10 - tt * 0.20));
          float waveB = sin(p.y * 3.10 - tt * 0.32 + sin(p.x * 2.70 + tt * 0.18));
          float swirl = sin(length(p + vec2(0.12 * sin(tt * 0.18), -0.08 * cos(tt * 0.15))) * 7.50 - tt * 0.28);
          float flow = waveA * 0.55 + waveB * 0.35 + swirl * 0.25;
          float ridge = 0.5 + 0.5 * sin((p.x + p.y) * 5.0 + flow * 1.6 + uHue);

          vec3 color = palette(flow * 1.4 + ridge * 1.7);
          float vignette = smoothstep(1.35, 0.18, length(p));
          color *= mix(0.72, 1.18, pow(vignette, 0.9) * uContrast);
          color += vec3(0.05, 0.025, 0.0) * pow(max(ridge, 0.0), 3.0) * vignette;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uHue: num(params.hue, 0),
        uSpeed: num(params.speed, 1),
        uContrast: num(params.contrast, 1),
      },
      fallback_gradient: "radial-gradient(circle at 18% 18%, rgba(212,180,131,0.14), transparent 34%), radial-gradient(circle at 82% 76%, rgba(218,119,86,0.12), transparent 40%), linear-gradient(135deg, #15110c 0%, #1a1510 52%, #241b14 100%)",
    };
  },

  describe(_t, params, vp) {
    return {
      sceneId: "gradientFlow",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "shader-field", role: "background", style: "warm-gradient-flow" },
        { type: "vignette", role: "depth", intensity: num(params.contrast, 1) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      hue: 0.12,
      speed: 1,
      contrast: 1,
    };
  },
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
