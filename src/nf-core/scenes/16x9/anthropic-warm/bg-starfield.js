export default {
  id: "bg-starfield",
  name: "bg-starfield",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "bg",

  description: "3D 视差星空 — 近景星更大更快，远景星更小更冷；用暖棕宇宙底承接 anthropic-warm 主题",
  duration_hint: null,

  type: "particle",
  frame_pure: true,
  assets: [],

  intent: `这不是纯黑科技感星空，而是给 anthropic-warm 做一块“有空气的深夜背景”。底层先铺一层暖棕到深靛的渐变，让画面继续保留书房、纸张、铜灯那种温度；上层 200-400 颗星按 depth 分层，近景更大、更亮、移动更快，远景更小、更冷、更慢，观众一眼就能感到空间深度。颜色从暖白到冷白的过渡也不是装饰，而是在同一块画面里同时保住“人文温度”和“宇宙感”的两端。`,

  when_to_use: [
    "需要一块不抢戏但明显比纯色背景更有纵深的开场或章节底图",
    "讲系统、推理、长上下文、宇宙尺度类隐喻时",
    "希望画面安静，但又不想完全静止时",
  ],

  when_not_to_use: [
    "前景已经有高频粒子或复杂线条效果，会互相打架",
    "需要强品牌几何秩序感时，网格或架构图底更合适",
    "主题要求白天、办公室、现实空间语义时",
  ],

  limitations: [
    "星点数量建议 200-400；再高会开始抢字幕注意力",
    "这是氛围背景，不负责讲结构信息",
    "极亮前景文字时建议叠加轻微暗色遮罩",
  ],

  inspired_by: "电影级星舰舷窗视差 + Anthropic 暖色品牌气质",
  used_in: [],

  requires: [],
  pairs_well_with: ["goldenClose", "glossaryCard", "statBig"],
  conflicts_with: ["bg-snowfall"],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "background",
  mood: ["calm", "vast", "warm"],

  tags: ["particle", "bg", "starfield", "parallax", "space", "anthropic-warm"],

  complexity: "medium",
  performance: { cost: "low", notes: "默认 320 粒子；单帧为渐变背景 + 小圆点绘制" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial particle release for v0.9 runtime" },
  ],

  params: {
    count: {
      type: "number",
      default: 320,
      semantic: "星点数量，建议 200-400",
    },
    seed: {
      type: "number",
      default: 42,
      semantic: "确定性种子",
    },
    speed: {
      type: "number",
      default: 90,
      semantic: "整体横向飞行速度，近景会按 depth 放大",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, _vp) {
    void host;
    const count = clampInt(params.count, 320, 200, 400);
    const seed = Math.floor(Number(params.seed) || 42);
    const speed = Math.max(10, Number(params.speed) || 90);

    return {
      emitter: {
        count,
        seed,
        spawn(rng, i, vp) {
          const depth = 0.18 + Math.pow(rng(), 1.35) * 0.82;
          const size = 0.45 + depth * 2.8;
          return {
            i,
            x: rng() * vp.width,
            y: rng() * vp.height,
            depth,
            size,
            alpha: 0.18 + depth * 0.82,
            phase: rng() * Math.PI * 2,
            drift: (0.5 + rng()) * speed * (0.25 + depth * depth * 1.7),
          };
        },
      },
      render: (ctx, p, time) => {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        if (p.i === 0) paintStarfieldBackdrop(ctx, W, H);

        const x = wrap(p.x - time * p.drift, W);
        const y = wrap(p.y + Math.sin(time * (0.12 + p.depth * 0.25) + p.phase) * (4 + p.depth * 16), H);
        const twinkle = 0.72 + 0.28 * Math.sin(time * (0.9 + p.depth * 1.6) + p.phase * 1.7);
        const alpha = p.alpha * twinkle;
        const color = lerpRgb([246, 224, 201], [232, 240, 255], 1 - p.depth);

        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (p.depth > 0.72) {
          ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(alpha * 0.35).toFixed(3)})`;
          ctx.lineWidth = 0.4 + p.depth * 0.5;
          ctx.beginPath();
          ctx.moveTo(x - p.size * 2.8, y);
          ctx.lineTo(x + p.size * 2.8, y);
          ctx.moveTo(x, y - p.size * 2.8);
          ctx.lineTo(x, y + p.size * 2.8);
          ctx.stroke();
        }
      },
    };
  },

  describe(t, params, vp) {
    return {
      sceneId: "bg-starfield",
      phase: t < 0.8 ? "enter" : "show",
      progress: Math.min(1, t / 0.8),
      visible: true,
      params,
      elements: [
        { type: "particle-field", role: "stars", count: clampInt(params.count, 320, 200, 400) },
        { type: "gradient", role: "backdrop", palette: ["#120f10", "#241819", "#0c1321"] },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      count: 320,
      seed: 42,
      speed: 90,
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

function paintStarfieldBackdrop(ctx, width, height) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#171112");
  base.addColorStop(0.55, "#221618");
  base.addColorStop(1, "#09111d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.18, height * 0.16, 0, width * 0.18, height * 0.16, width * 0.6);
  glow.addColorStop(0, "rgba(218, 119, 86, 0.18)");
  glow.addColorStop(1, "rgba(218, 119, 86, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}
