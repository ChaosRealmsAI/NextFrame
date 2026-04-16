export default {
  id: "bg-snowfall",
  name: "bg-snowfall",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "bg",

  description: "飘雪背景 — 顶部生成、底部用 y 取模回卷，带轻微风向偏移和景深大小差",
  duration_hint: null,

  type: "particle",
  frame_pure: true,
  assets: [],

  intent: `这个组件不是北欧冷蓝雪景，而是“暖室窗外的雪”。底色保留 anthropic-warm 的烘焙棕和灯下奶白，雪粒则做成前后层次分明的缓慢下落：近景更大、更亮、飘得更快，远景更细、更淡、更慢。最关键的实现是 frame-pure 的循环下落，所有雪粒都由初始种子和当前 t 推导，落到底部后用 y 取模回到顶部，不需要任何状态缓存，也不会因为 seek 或导出跳帧而闪烁。`,

  when_to_use: [
    "需要安静、温柔、冬夜感的背景时",
    "收尾、旁白、金句页等低冲突镜头",
    "希望画面持续有生命迹象，但不能像火花那样高频时",
  ],

  when_not_to_use: [
    "前景有大量白字小字且对比度已经很紧张时",
    "节奏激烈、需要能量感和方向性时",
    "主题是室内 UI、图表、结构说明时",
  ],

  limitations: [
    "默认 220 粒雪，更多会让画面偏雾化",
    "雪的风向是轻微侧移，不适合暴风雪语义",
    "如果要绝对纯净背景，应该换静态渐变底",
  ],

  inspired_by: "电影片头的窗外雪幕 + 温暖灯光下的微粒悬浮",
  used_in: [],

  requires: [],
  pairs_well_with: ["goldenClose", "statBig"],
  conflicts_with: ["bg-starfield", "fx-sparkBurst"],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "background",
  mood: ["soft", "winter", "gentle"],

  tags: ["particle", "bg", "snowfall", "snow", "loop", "anthropic-warm"],

  complexity: "medium",
  performance: { cost: "low", notes: "默认 220 粒子；圆点 + 少量模糊 glow" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial particle release for v0.9 runtime" },
  ],

  params: {
    count: {
      type: "number",
      default: 220,
      semantic: "雪粒数量，建议 160-280",
    },
    seed: {
      type: "number",
      default: 24,
      semantic: "确定性种子",
    },
    wind: {
      type: "number",
      default: 24,
      semantic: "风向横移速度，正值向右，负值向左",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, _vp) {
    void host;
    const count = clampInt(params.count, 220, 160, 280);
    const seed = Math.floor(Number(params.seed) || 24);
    const wind = Number(params.wind);
    const windSpeed = Number.isFinite(wind) ? wind : 24;

    return {
      emitter: {
        count,
        seed,
        spawn(rng, i, vp) {
          const depth = 0.2 + Math.pow(rng(), 1.5) * 0.8;
          const size = 0.8 + depth * 4.4;
          return {
            i,
            x: rng() * vp.width,
            y: rng() * vp.height,
            depth,
            size,
            alpha: 0.18 + depth * 0.52,
            phase: rng() * Math.PI * 2,
            fall: 32 + depth * 126,
            drift: (windSpeed * (0.35 + depth * 0.9)) + (rng() - 0.5) * 10,
            sway: 8 + depth * 26,
          };
        },
      },
      render: (ctx, p, time) => {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        if (p.i === 0) paintSnowBackdrop(ctx, W, H);

        const y = (p.y + time * p.fall) % (H + p.size * 8) - p.size * 4;
        const x = wrap(p.x + time * p.drift + Math.sin(time * 0.9 + p.phase) * p.sway, W + 80) - 40;
        const alpha = p.alpha * (0.82 + 0.18 * Math.sin(time * 1.2 + p.phase));

        ctx.fillStyle = `rgba(247, 242, 236, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (p.depth > 0.62) {
          const glow = ctx.createRadialGradient(x, y, 0, x, y, p.size * 4.2);
          glow.addColorStop(0, `rgba(255, 246, 240, ${(alpha * 0.26).toFixed(3)})`);
          glow.addColorStop(1, "rgba(255, 246, 240, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, p.size * 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    };
  },

  describe(t, params, vp) {
    return {
      sceneId: "bg-snowfall",
      phase: t < 0.8 ? "enter" : "show",
      progress: Math.min(1, t / 0.8),
      visible: true,
      params,
      elements: [
        { type: "particle-field", role: "snow", count: clampInt(params.count, 220, 160, 280) },
        { type: "gradient", role: "backdrop", palette: ["#1f1715", "#2a1d1a", "#3a2c26"] },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      count: 220,
      seed: 24,
      wind: 24,
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

function paintSnowBackdrop(ctx, width, height) {
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#211816");
  base.addColorStop(0.48, "#31231e");
  base.addColorStop(1, "#120f10");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const wash = ctx.createRadialGradient(width * 0.32, height * 0.18, 0, width * 0.32, height * 0.18, width * 0.58);
  wash.addColorStop(0, "rgba(248, 228, 207, 0.12)");
  wash.addColorStop(1, "rgba(248, 228, 207, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
}
