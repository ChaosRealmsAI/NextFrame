export default {
  id: "fx-sparkBurst",
  name: "fx-sparkBurst",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "fx",

  description: "点击式火花爆发 — 从 triggerAt 开始沿圆周喷射，位置和透明度完全由 t - triggerAt 推导",
  duration_hint: 1.4,

  type: "particle",
  frame_pure: true,
  assets: [],

  intent: `这是一个给“点到为止的能量瞬间”准备的效果，不是持续喷泉。参数里只有一个核心时刻 triggerAt，所有火花都在那一刻被“逻辑触发”，之后沿圆周飞出并在 1 秒多内迅速衰减。因为位置、尾迹长度、透明度都只依赖 t - triggerAt 和粒子 id 的确定性种子，所以无论预览 seek、导出逐帧还是重复渲染，爆发形状都完全一致。视觉上我把它做成偏铜金与暖白的短促火花，而不是赛博霓虹，这样才能和 anthropic-warm 的底色搭上。`,

  when_to_use: [
    "强调一个点击、确认、顿悟、命中或章节切点",
    "配合数字出现、术语揭示、按钮触发类镜头",
    "需要瞬时能量，但不想让效果持续霸占画面时",
  ],

  when_not_to_use: [
    "需要持续燃烧、喷射、焰火级效果时",
    "整段画面已经很忙，再加 burst 会过载",
    "时间点不明确、没有明确 triggerAt 叙事锚点时",
  ],

  limitations: [
    "默认持续约 1.2 秒，再长就不像 burst",
    "如果 origin 放在画面边缘，部分粒子会自然飞出画布",
    "这是覆盖层效果，通常不单独承担背景职责",
  ],

  inspired_by: "交互设计里的 tap sparkle + 金属火花飞散",
  used_in: [],

  requires: [],
  pairs_well_with: ["statBig", "glossaryCard", "bg-starfield"],
  conflicts_with: ["bg-snowfall"],
  alternatives: [],

  visual_weight: "light",
  z_layer: "foreground",
  mood: ["sharp", "brief", "energetic"],

  tags: ["particle", "fx", "spark", "burst", "trigger", "anthropic-warm"],

  complexity: "medium",
  performance: { cost: "low", notes: "默认 42 粒子；每粒一条尾迹加头部亮点" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial particle release for v0.9 runtime" },
  ],

  params: {
    count: {
      type: "number",
      default: 42,
      semantic: "火花数量，建议 24-72",
    },
    seed: {
      type: "number",
      default: 77,
      semantic: "确定性种子",
    },
    triggerAt: {
      type: "number",
      default: 0,
      semantic: "触发时刻，单位秒",
    },
    originX: {
      type: "number",
      default: 0.5,
      semantic: "爆发中心 X，0-1 相对坐标",
    },
    originY: {
      type: "number",
      default: 0.5,
      semantic: "爆发中心 Y，0-1 相对坐标",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, _vp) {
    void host;
    const count = clampInt(params.count, 42, 24, 72);
    const seed = Math.floor(Number(params.seed) || 77);
    const triggerAt = Number(params.triggerAt) || 0;
    const originX = clamp01(Number(params.originX));
    const originY = clamp01(Number(params.originY));

    return {
      emitter: {
        count,
        seed,
        spawn(rng, i, vp) {
          const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.12;
          return {
            i,
            x: vp.width * (Number.isFinite(originX) ? originX : 0.5),
            y: vp.height * (Number.isFinite(originY) ? originY : 0.5),
            depth: 0.35 + rng() * 0.65,
            size: 1.4 + rng() * 2.4,
            angle,
            speed: 180 + rng() * 320,
            tail: 18 + rng() * 34,
            spin: (rng() - 0.5) * 2.2,
            alpha: 0.42 + rng() * 0.5,
            hueMix: rng(),
          };
        },
      },
      render: (ctx, p, time) => {
        const dt = time - triggerAt;
        if (dt <= 0) return;
        const life = Math.min(1, dt / 1.2);
        if (life >= 1) return;

        const ease = 1 - Math.pow(1 - life, 3);
        const distance = p.speed * ease;
        const angle = p.angle + dt * p.spin;
        const x = p.x + Math.cos(angle) * distance;
        const y = p.y + Math.sin(angle) * distance;
        const tail = p.tail * (1 - life * 0.65);
        const alpha = p.alpha * Math.pow(1 - life, 1.6);
        const warm = lerpRgb([255, 244, 228], [218, 119, 86], p.hueMix);
        const tx = x - Math.cos(angle) * tail;
        const ty = y - Math.sin(angle) * tail;

        ctx.strokeStyle = `rgba(${warm[0]}, ${warm[1]}, ${warm[2]}, ${(alpha * 0.75).toFixed(3)})`;
        ctx.lineWidth = 1 + p.depth * 1.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();

        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.size * 5);
        glow.addColorStop(0, `rgba(${warm[0]}, ${warm[1]}, ${warm[2]}, ${(alpha * 0.8).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${warm[0]}, ${warm[1]}, ${warm[2]}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 249, 241, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      },
    };
  },

  describe(t, params, vp) {
    return {
      sceneId: "fx-sparkBurst",
      phase: t < (Number(params.triggerAt) || 0) ? "idle" : "active",
      progress: Math.max(0, Math.min(1, (t - (Number(params.triggerAt) || 0)) / 1.2)),
      visible: true,
      params,
      elements: [
        { type: "particle-burst", role: "spark", count: clampInt(params.count, 42, 24, 72) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      count: 42,
      seed: 77,
      triggerAt: 0.4,
      originX: 0.5,
      originY: 0.42,
    };
  },
};

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function lerpRgb(a, b, t) {
  const p = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * p),
    Math.round(a[1] + (b[1] - a[1]) * p),
    Math.round(a[2] + (b[2] - a[2]) * p),
  ];
}
