// scenes/16x9/warm-editorial/overlay-inkSplatter.js
//
// inkSplatter — 墨水飞溅，从 triggerAt 时刻起墨点向外辐射，带拖尾

export default {
  // ===== Identity =====
  id: "inkSplatter",
  name: "Ink Splatter",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",

  // ===== Semantics =====
  description: "墨水飞溅 — 从 triggerAt 时刻起 N 颗墨点从中心向外辐射，带拖尾衰减",
  duration_hint: 2.0,

  // ===== Render type =====
  type: "particle",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI understanding layer =====
  // ========================================

  intent: `书法/水墨风的动态装饰。当章节标题出现、关键观点落地、或段落切换时，一滴墨水从画面某点炸开，N 颗（默认 25）深棕/黑色墨点沿径向飞出，每颗带 2-3px 的拖尾线段模拟飞溅轨迹。墨点大小不均（1.5-5px），速度不均（快的先到边缘先消失），alpha 从触发时 0.7 线性衰减到 0，整个动画 1.5-2 秒结束。颜色从 theme 的 ink #2c2418 到砖红 #c45a3c 之间随机分配，像毛笔蘸了浓淡不同的墨。这不是 UI 特效而是"书法"语义 — 和章节切换/金句展示搭配时强化人文感。triggerAt 之前画面为空，之后爆发一次然后衰减归零。`,

  when_to_use: [
    "章节标题出现的瞬间，配合 text-chapterTitle 的入场动画",
    "关键观点落地时的视觉强调",
    "段落切换的转场装饰",
  ],

  when_not_to_use: [
    "静态阅读页面（墨水飞溅太突兀）",
    "高频使用 — 一集最多 2-3 次，否则变廉价",
    "暗色模式下深色墨点看不见",
  ],

  limitations: [
    "只爆发一次（triggerAt 触发），不循环",
    "动画持续约 2 秒，之后画面为空",
    "墨点数量超过 40 会变成一团黑",
    "originX/originY 需要配合内容布局手动调整",
  ],

  inspired_by: "毛笔书法的墨溅 + 水墨画的泼墨效果 + 日本书道视频的慢放飞墨",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["text-chapterTitle", "content-pullQuote"],
  conflicts_with: [],
  alternatives: [],

  // ===== Visual weight =====
  visual_weight: "medium",
  z_layer: "overlay",
  mood: ["dramatic", "literary", "artistic", "calligraphic"],

  // ===== Index =====
  tags: ["inkSplatter", "overlay", "particle", "ink", "splatter", "calligraphy", "warm-editorial", "墨水", "飞溅", "书法"],

  // ===== Engineering =====
  complexity: "medium",
  performance: { cost: "low", notes: "25 颗粒子 + 拖尾线段；triggerAt 之前零开销" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial particle — ink splatter effect for editorial theme" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    count: {
      type: "number",
      default: 25,
      semantic: "墨点数量，建议 15-40",
    },
    seed: {
      type: "number",
      default: 42,
      semantic: "确定性种子",
    },
    triggerAt: {
      type: "number",
      default: 0.5,
      semantic: "触发时刻（秒），此时刻开始爆发",
    },
    duration: {
      type: "number",
      default: 1.8,
      semantic: "爆发动画持续时间（秒）",
    },
    originX: {
      type: "number",
      default: 0.5,
      semantic: "爆发中心 X（0-1 归一化坐标）",
    },
    originY: {
      type: "number",
      default: 0.5,
      semantic: "爆发中心 Y（0-1 归一化坐标）",
    },
    spread: {
      type: "number",
      default: 280,
      semantic: "扩散半径（px），墨点最远飞多远",
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
    const count = clampInt(params.count, 25, 10, 50);
    const seed = Math.floor(Number(params.seed) || 42);
    const triggerAt = num(params.triggerAt, 0.5);
    const duration = num(params.duration, 1.8);
    const originX = num(params.originX, 0.5);
    const originY = num(params.originY, 0.5);
    const spread = num(params.spread, 280);

    return {
      emitter: {
        count,
        seed,
        spawn(rng, i, vp) {
          // angle: radial distribution with some randomness
          const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.8;
          const speedMul = 0.4 + rng() * 0.6;  // speed variation
          const size = 1.5 + rng() * 3.5;       // 1.5-5px
          // color: mix between ink #2c2418 and brick-red #c45a3c
          const colorMix = rng();

          return {
            i,
            x: originX * vp.width,
            y: originY * vp.height,
            depth: rng(),
            size,
            angle,
            speedMul,
            colorMix,
            tailLength: 6 + rng() * 12,  // trail length in px
            triggerAt,
            duration,
            spread,
          };
        },
      },
      render: (ctx, p, time) => {
        const elapsed = time - p.triggerAt;
        if (elapsed < 0 || elapsed > p.duration) return;

        // progress 0→1 over duration
        const progress = elapsed / p.duration;

        // easeOut: fast start, slow end
        const ease = 1 - Math.pow(1 - progress, 2);

        // position: radial expansion
        const dist = ease * p.spread * p.speedMul;
        const x = p.x + Math.cos(p.angle) * dist;
        const y = p.y + Math.sin(p.angle) * dist;

        // alpha: starts at 0.7, fades to 0
        const alpha = 0.7 * (1 - progress);
        if (alpha < 0.01) return;

        // tail: line from current pos back toward origin
        const tailDist = Math.max(0, dist - p.tailLength);
        const tx = p.x + Math.cos(p.angle) * tailDist;
        const ty = p.y + Math.sin(p.angle) * tailDist;

        // color interpolation: ink → brick-red
        const r = Math.floor(44 + (196 - 44) * p.colorMix);
        const g = Math.floor(36 + (90 - 36) * p.colorMix);
        const b = Math.floor(24 + (60 - 24) * p.colorMix);

        // draw tail
        if (dist > p.tailLength * 0.5) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.5).toFixed(3)})`;
          ctx.lineWidth = p.size * 0.4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        // draw ink dot (slightly irregular — use small ellipse)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, p.size, p.size * 0.7, p.angle, 0, Math.PI * 2);
        ctx.fill();

        // some dots get a secondary splatter
        if (p.i % 4 === 0 && progress > 0.3 && progress < 0.7) {
          const subAlpha = alpha * 0.4;
          const sx = x + Math.cos(p.angle + 0.8) * p.size * 3;
          const sy = y + Math.sin(p.angle + 0.8) * p.size * 3;
          ctx.fillStyle = `rgba(${r},${g},${b},${subAlpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, p.size * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    };
  },

  describe(t, params, vp) {
    const triggerAt = num(params.triggerAt, 0.5);
    const duration = num(params.duration, 1.8);
    const elapsed = t - triggerAt;
    const active = elapsed >= 0 && elapsed <= duration;
    return {
      sceneId: "inkSplatter",
      phase: active ? "show" : (elapsed < 0 ? "hidden" : "exit"),
      progress: active ? Math.min(1, elapsed / duration) : (elapsed < 0 ? 0 : 1),
      visible: active,
      params,
      elements: active ? [
        { type: "particle-burst", role: "ink-splatter", count: clampInt(params.count, 25, 10, 50), progress: elapsed / duration },
      ] : [],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      count: 25,
      seed: 42,
      triggerAt: 0.5,
      duration: 1.8,
      originX: 0.5,
      originY: 0.5,
      spread: 280,
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
