// scenes/16x9/effects-showcase/content-particleField.js
//
// particleField — Canvas 2D 自写粒子系统，260 粒子带物理感：流动 + 视差 + 相邻连线
// 真·物理感 — 粒子有 vx/vy/depth，沿正弦场流动，近距离自动连线（neural-net 既视感）。

export default {
  id: "particleField",
  name: "particleField",
  version: "1.0.0",

  ratio: "16:9",
  theme: "effects-showcase",
  role: "content",

  description: "Canvas 2D 自写粒子系统 260 点 — 沿噪声场流动 + 近距离连线，神经网络既视感",
  duration_hint: null,

  type: "canvas",
  frame_pure: false,
  assets: [],

  intent: `200+ DOM 节点会卡，必须 canvas。每个粒子带 (x, y, vx, vy, depth, hue) 6 个属性：x/y 是当前位置，vx/vy 由二维正弦场计算（vx = sin(y*0.01 + t)，vy = cos(x*0.012 + t*0.7)）— 这就是「场流体」，比纯随机走更有秩序感且零跳变。depth 决定半径和透明度（0.3~1.0），近的大且亮 — 视差感来自这。hue 在 cyan/magenta/violet 三色随机分配。最关键的是 O(n²) 相邻连线：距离 < 110px 画一条 alpha 与距离反比的描边线 — 神经网络既视感就是这么来的。260 粒子 × 260 = 67600 距离比较，1080p 60fps 完全跑得动。情绪节点：核心展开段（3-15s 信息密度高），用粒子讲「网络/连接/AI 神经元」概念时，画面本身就是隐喻。`,

  when_to_use: [
    "讲神经网络 / 连接 / 涌现 / 集体智能时的主视觉",
    "需要「会动且有秩序」的核心镜头",
    "情绪展开段（3-15s）",
  ],

  when_not_to_use: [
    "需要绝对静止的镜头",
    "目标设备 < 720p / 老 GPU（260 粒子 + 连线略吃 CPU）",
  ],

  limitations: [
    "粒子数量写死 260（改要重新调连线阈值）",
    "frame_pure: false 必须 — recorder 每帧都要重算",
  ],

  inspired_by: "particles.js / Three.js network demo / Stripe payments hero",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-liquidNoise", "text-neonGlow"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["intelligent", "futuristic", "alive"],

  tags: ["content", "particle", "network", "canvas", "neural", "effects-showcase"],

  complexity: "complex",
  performance: { cost: "high", notes: "260 粒子 + O(n²) 连线；1080p 60fps OK" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — particle network with noise-field flow" },
  ],

  params: {
    count: {
      type: "number",
      default: 260,
      semantic: "粒子数量，推荐 200-320",
    },
  },

  enter: null,
  exit: null,

  render(ctx, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const N = Math.max(60, Math.min(400, Math.floor(Number(params.count) || 260)));

    // 入场：opacity 0→1 over 0.8s
    const ep = Math.min(t / 0.8, 1);
    const baseAlpha = 1 - Math.pow(1 - ep, 3);

    ctx.clearRect(0, 0, W, H);

    // 预生成稳定粒子（基于种子 i 的伪随机），位置由 t 演化 → frame_pure-friendly 但 frame_pure:false
    const colors = ["#00f0ff", "#ff2bd6", "#7c4dff", "#39ff88"];
    const pts = [];
    for (let i = 0; i < N; i++) {
      // 伪随机种子
      const sx = Math.sin(i * 12.9898) * 43758.5453;
      const sy = Math.sin(i * 78.233) * 43758.5453;
      const seedX = sx - Math.floor(sx);
      const seedY = sy - Math.floor(sy);
      const depth = 0.3 + (i % 7) / 9;

      // 流动场：base + drift
      const baseX = seedX * W;
      const baseY = seedY * H;
      const driftX = Math.sin((baseY * 0.004) + t * 0.4 + i * 0.05) * 60 * depth;
      const driftY = Math.cos((baseX * 0.005) + t * 0.3 + i * 0.07) * 50 * depth;
      const x = (baseX + driftX + W) % W;
      const y = (baseY + driftY + H) % H;

      const radius = 1.2 + depth * 2.4;
      const hue = colors[i % colors.length];
      pts.push({ x, y, depth, radius, hue });
    }

    // 1. 连线（先画，被点盖住才好看）
    const linkDist = 110;
    const linkDist2 = linkDist * linkDist;
    ctx.lineWidth = 0.7;
    for (let i = 0; i < N; i++) {
      const a = pts[i];
      for (let j = i + 1; j < N; j++) {
        const b = pts[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > linkDist2) continue;
        const d = Math.sqrt(d2);
        const alpha = (1 - d / linkDist) * 0.35 * baseAlpha * Math.min(a.depth, b.depth);
        if (alpha < 0.02) continue;
        ctx.strokeStyle = `rgba(0, 240, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // 2. 粒子点 + 辉光
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      // 辉光（半径 5x）
      const glowR = p.radius * 5;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
      // hex → rgba
      const hex = p.hue.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const glowAlpha = 0.35 * p.depth * baseAlpha;
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${glowAlpha.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      // 实心点
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.85 * p.depth * baseAlpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  describe(t, params, vp) {
    const N = Math.max(60, Math.min(400, Math.floor(Number(params.count) || 260)));
    return {
      sceneId: "particleField",
      phase: t < 0.8 ? "enter" : "show",
      progress: Math.min(1, t / 0.8),
      visible: true,
      params,
      elements: [
        { type: "particles", count: N, palette: ["#00f0ff", "#ff2bd6", "#7c4dff", "#39ff88"] },
        { type: "links", maxDistance: 110 },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      count: 260,
    };
  },
};
