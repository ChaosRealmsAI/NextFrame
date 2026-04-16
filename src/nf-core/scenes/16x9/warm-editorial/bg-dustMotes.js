// scenes/16x9/warm-editorial/bg-dustMotes.js
//
// dustMotes — 空气中漂浮的暖色微尘，模拟阳光中的灰尘颗粒

export default {
  // ===== Identity =====
  id: "dustMotes",
  name: "Dust Motes",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "warm-editorial",
  role: "bg",

  // ===== Semantics =====
  description: "空气中漂浮微尘 — 30-50 颗暖色小点慢速 sin 轨迹，模拟阳光中的灰尘",
  duration_hint: null,

  // ===== Render type =====
  type: "particle",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI understanding layer =====
  // ========================================

  intent: `深夜书房或午后书桌上，一束光打进来，你能看到空气中缓缓飘动的微小灰尘。这些微尘是"有人在"的证据 — 没有微尘的画面像 CG 渲染，有微尘就有温度。每颗微尘走独立的 sin 轨迹（相位随 seed 不同），大小在 1-3px 之间随深度变化，颜色是砖红 #c45a3c 的极低 alpha（0.08-0.2），在米白底上几乎透明但确实在。速度极慢：最快的微尘 y 方向每秒移动 8px，x 方向做 ±15px 的缓慢飘荡。数量控制在 30-50 颗 — 多了像沙尘暴，少了看不出效果。这是"看不见但感觉得到"的氛围层。`,

  when_to_use: [
    "叠在 paperGrain 或 warmGlow 之上，增加空气感和温度",
    "静止或慢推镜头中保持画面生命感",
    "旁白段、引用段、过渡页等低信息密度场景",
  ],

  when_not_to_use: [
    "前景有大量小号文字（微尘会干扰阅读）",
    "高节奏剪辑段（微尘太慢跟不上节奏）",
    "暗色模式（米白底上的砖红微尘在暗底上不work）",
  ],

  limitations: [
    "微尘极小（1-3px），1080p 下肉眼勉强可见，720p 下基本不可见",
    "数量超过 60 颗会变得太吵，破坏宁静感",
    "不适合和 snowfall 类粒子叠用 — 语义冲突",
  ],

  inspired_by: "午后书桌上的一束阳光里漂浮的灰尘 + 电影中常用的空气微粒特效",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["paperGrain", "warmGlow", "linenTexture", "content-editorial", "content-pullQuote"],
  conflicts_with: ["bg-snowfall"],
  alternatives: [],

  // ===== Visual weight =====
  visual_weight: "light",
  z_layer: "background",
  mood: ["calm", "warm", "intimate", "quiet", "literary"],

  // ===== Index =====
  tags: ["dustMotes", "bg", "particle", "dust", "motes", "float", "warm-editorial", "微尘", "灰尘", "漂浮"],

  // ===== Engineering =====
  complexity: "simple",
  performance: { cost: "low", notes: "30-50 颗粒子，圆点绘制，无 glow 无模糊" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial particle — warm dust motes for editorial theme" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    count: {
      type: "number",
      default: 40,
      semantic: "微尘数量，建议 30-50",
    },
    seed: {
      type: "number",
      default: 17,
      semantic: "确定性种子",
    },
    speed: {
      type: "number",
      default: 1.0,
      semantic: "速度倍率，1 = 极慢漂浮",
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
    const count = clampInt(params.count, 40, 20, 60);
    const seed = Math.floor(Number(params.seed) || 17);
    const speed = num(params.speed, 1.0);

    return {
      emitter: {
        count,
        seed,
        spawn(rng, i, vp) {
          const depth = 0.3 + rng() * 0.7;
          const size = 0.8 + depth * 2.2;  // 0.8-3.0 px
          return {
            i,
            x: rng() * vp.width,
            y: rng() * vp.height,
            depth,
            size,
            alpha: 0.08 + depth * 0.12,    // 0.08-0.20
            phase: rng() * Math.PI * 2,
            phaseY: rng() * Math.PI * 2,
            driftX: (rng() - 0.5) * 4,     // base horizontal drift
            fallSpeed: 3 + depth * 5,       // 3-8 px/s vertical
            swayX: 8 + depth * 7,           // horizontal sway amplitude
            swayY: 3 + depth * 4,           // vertical sway amplitude
          };
        },
      },
      render: (ctx, p, time) => {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        const t = time * speed;

        // gentle sin trajectory — each mote has unique phase
        const x = wrap(p.x + p.driftX * t + Math.sin(t * 0.4 + p.phase) * p.swayX, W);
        const y = wrap(p.y + p.fallSpeed * t + Math.sin(t * 0.3 + p.phaseY) * p.swayY, H);

        // alpha breathes slowly
        const alpha = p.alpha * (0.7 + 0.3 * Math.sin(t * 0.8 + p.phase));

        // warm brick-red from theme: #c45a3c
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#c45a3c";
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // deeper motes get a tiny soft glow
        if (p.depth > 0.7) {
          const glow = ctx.createRadialGradient(x, y, 0, x, y, p.size * 3);
          glow.addColorStop(0, `rgba(196, 90, 60, ${(alpha * 0.15).toFixed(3)})`);
          glow.addColorStop(1, "rgba(196, 90, 60, 0)");
          ctx.globalAlpha = 1;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = 1;
      },
    };
  },

  describe(t, params, vp) {
    return {
      sceneId: "dustMotes",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "particle-field", role: "dust", count: clampInt(params.count, 40, 20, 60) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      count: 40,
      seed: 17,
      speed: 1.0,
    };
  },
};

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}
