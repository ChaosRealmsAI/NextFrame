export default {
  id: "fx-floatMotes",
  name: "fx-floatMotes",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "fx",

  description: "漂浮光点 — 少量缓慢 motes 按各自 sin 轨迹游走，为画面提供低频氛围层",
  duration_hint: null,

  type: "particle",
  frame_pure: true,
  assets: [],

  intent: `这个组件的任务不是“被看到”，而是让画面有呼吸。数量控制在 30-50 之间，每颗光点都围绕自己的锚点做慢速 sin/cos 轨迹，振幅、相位、尺寸都由种子决定，所以整层会像空气里浮着温暖灰尘、镜头前有一点点浅景深微粒，而不是无方向乱跑的噪声。它特别适合给 anthropic-warm 这种克制主题补一层极轻的电影感，让静态标题页和术语页不至于完全板住。`,

  when_to_use: [
    "金句页、术语页、类比页等需要轻微生命感的镜头",
    "希望画面更有空气和景深，但又不想加明显结构图形时",
    "作为背景和正文之间的中间氛围层",
  ],

  when_not_to_use: [
    "已经有雪、火花、连线网络等更强粒子效果时",
    "需要完全无干扰的极简页面时",
    "信息密度很高的小字页面时",
  ],

  limitations: [
    "默认 38 粒，太多会失去“稀疏空气感”",
    "光点移动很慢，不适合节奏推动型镜头",
    "主要承担氛围职责，不表达明确结构含义",
  ],

  inspired_by: "电影镜头里的浮尘 + 柔焦镜片前的空气颗粒",
  used_in: [],

  requires: [],
  pairs_well_with: ["goldenClose", "analogyCard", "glossaryCard"],
  conflicts_with: ["fx-connectGraph"],
  alternatives: [],

  visual_weight: "light",
  z_layer: "mid",
  mood: ["subtle", "warm", "atmospheric"],

  tags: ["particle", "fx", "motes", "float", "ambient", "anthropic-warm"],

  complexity: "simple",
  performance: { cost: "low", notes: "默认 38 粒子；每粒一个 radial glow" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial particle release for v0.9 runtime" },
  ],

  params: {
    count: {
      type: "number",
      default: 38,
      semantic: "光点数量，建议 30-50",
    },
    seed: {
      type: "number",
      default: 13,
      semantic: "确定性种子",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, _vp) {
    void host;
    const count = clampInt(params.count, 38, 30, 50);
    const seed = Math.floor(Number(params.seed) || 13);

    return {
      emitter: {
        count,
        seed,
        spawn(rng, i, vp) {
          return {
            i,
            x: rng() * vp.width,
            y: rng() * vp.height,
            depth: 0.28 + rng() * 0.72,
            size: 1.6 + rng() * 5.2,
            alpha: 0.1 + rng() * 0.24,
            phaseX: rng() * Math.PI * 2,
            phaseY: rng() * Math.PI * 2,
            ampX: 14 + rng() * 70,
            ampY: 10 + rng() * 54,
            speedX: 0.08 + rng() * 0.28,
            speedY: 0.06 + rng() * 0.24,
            hueMix: rng(),
          };
        },
      },
      render: (ctx, p, time) => {
        const x = wrap(p.x + Math.sin(time * p.speedX + p.phaseX) * p.ampX, ctx.canvas.width);
        const y = wrap(p.y + Math.cos(time * p.speedY + p.phaseY) * p.ampY, ctx.canvas.height);
        const alpha = p.alpha * (0.82 + 0.18 * Math.sin(time * (0.5 + p.depth * 0.3) + p.phaseX));
        const color = lerpRgb([255, 243, 228], [218, 119, 86], p.hueMix * 0.35);

        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.size * 5.8);
        glow.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(alpha * 0.55).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 5.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 248, 240, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      },
    };
  },

  describe(t, params, vp) {
    return {
      sceneId: "fx-floatMotes",
      phase: t < 0.8 ? "enter" : "show",
      progress: Math.min(1, t / 0.8),
      visible: true,
      params,
      elements: [
        { type: "particle-field", role: "motes", count: clampInt(params.count, 38, 30, 50) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      count: 38,
      seed: 13,
    };
  },
};

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function lerpRgb(a, b, t) {
  const p = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * p),
    Math.round(a[1] + (b[1] - a[1]) * p),
    Math.round(a[2] + (b[2] - a[2]) * p),
  ];
}
