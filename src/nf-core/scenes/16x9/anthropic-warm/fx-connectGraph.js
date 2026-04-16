export default {
  id: "fx-connectGraph",
  name: "fx-connectGraph",
  version: "1.0.0",

  ratio: "16:9",
  theme: "anthropic-warm",
  role: "fx",

  description: "粒子连线图 — 漂浮节点按近距连线，透明度随距离衰减，适合抽象表达关系与上下文网络",
  duration_hint: null,

  type: "particle",
  frame_pure: true,
  assets: [],

  intent: `这个效果的重点不是“很多点”，而是“关系正在临时出现和消失”。每个粒子都沿自己的缓慢漂移轨迹运动，只有进入阈值距离时才连线，线的透明度按距离反比衰减，于是画面不会变成一张静态蜘蛛网，而更像语义网络、上下文窗口、工具调用之间的暂时连接。为了适配 anthropic-warm，我把节点颜色压在暖白和铜橙附近，避免赛博蓝；同时把位移速度压低，让它更像思考中的结构，而不是高能量科技 UI。`,

  when_to_use: [
    "讲上下文关系、消息连接、agent 协作、图谱类抽象概念时",
    "需要一个信息感很强但仍然克制的覆盖层",
    "章节中段，需要比静态背景更有结构暗示时",
  ],

  when_not_to_use: [
    "前景已经有真实图表或节点图，不需要再叠一个抽象隐喻",
    "镜头需要完全安静干净的留白",
    "低端机器上同时叠加多个高开销 canvas 效果时",
  ],

  limitations: [
    "默认 58 粒子，数量过高会让连线密度迅速失控",
    "阈值只做近距连接，不适合表达明确拓扑结构",
    "这是抽象语言，不提供精确数据可视化语义",
  ],

  inspired_by: "神经网络可视化 + 桌面研究图谱的漂浮连接感",
  used_in: [],

  requires: [],
  pairs_well_with: ["glossaryCard", "slotGrid", "bg-starfield"],
  conflicts_with: ["fx-floatMotes"],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "mid",
  mood: ["thoughtful", "structured", "alive"],

  tags: ["particle", "fx", "graph", "network", "links", "anthropic-warm"],

  complexity: "medium",
  performance: { cost: "medium", notes: "默认 58 粒子；闭包内做近邻比较，单帧 O(n²)" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial particle release for v0.9 runtime" },
  ],

  params: {
    count: {
      type: "number",
      default: 58,
      semantic: "节点数量，建议 36-72",
    },
    seed: {
      type: "number",
      default: 91,
      semantic: "确定性种子",
    },
    threshold: {
      type: "number",
      default: 132,
      semantic: "连线距离阈值，像素",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, _vp) {
    void host;
    const count = clampInt(params.count, 58, 36, 72);
    const seed = Math.floor(Number(params.seed) || 91);
    const threshold = Math.max(40, Number(params.threshold) || 132);
    const prior = [];

    return {
      emitter: {
        count,
        seed,
        spawn(rng, i, vp) {
          return {
            i,
            x: rng() * vp.width,
            y: rng() * vp.height,
            depth: 0.25 + rng() * 0.75,
            size: 1.2 + rng() * 2.4,
            alpha: 0.22 + rng() * 0.38,
            phaseX: rng() * Math.PI * 2,
            phaseY: rng() * Math.PI * 2,
            ampX: 16 + rng() * 52,
            ampY: 10 + rng() * 34,
            driftX: (rng() - 0.5) * 12,
            driftY: (rng() - 0.5) * 10,
            hueMix: rng(),
          };
        },
      },
      render: (ctx, p, time) => {
        const x = wrap(p.x + Math.sin(time * (0.22 + p.depth * 0.18) + p.phaseX) * p.ampX + time * p.driftX, ctx.canvas.width);
        const y = wrap(p.y + Math.cos(time * (0.2 + p.depth * 0.16) + p.phaseY) * p.ampY + time * p.driftY, ctx.canvas.height);
        const color = lerpRgb([244, 233, 221], [218, 119, 86], p.hueMix * 0.75);

        for (let i = 0; i < prior.length; i++) {
          const q = prior[i];
          const dx = x - q.x;
          const dy = y - q.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance >= threshold) continue;
          const alpha = (1 - distance / threshold) * 0.22 * Math.min(p.alpha, q.alpha);
          if (alpha < 0.012) continue;
          ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.55 + Math.min(p.depth, q.depth) * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }

        prior.push({ x, y, alpha: p.alpha, depth: p.depth });

        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.size * 5.5);
        glow.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(p.alpha * 0.35).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(p.alpha * 1.2).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      },
    };
  },

  describe(t, params, vp) {
    return {
      sceneId: "fx-connectGraph",
      phase: t < 0.8 ? "enter" : "show",
      progress: Math.min(1, t / 0.8),
      visible: true,
      params,
      elements: [
        {
          type: "particle-graph",
          role: "network",
          count: clampInt(params.count, 58, 36, 72),
          threshold: Math.max(40, Number(params.threshold) || 132),
        },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      count: 58,
      seed: 91,
      threshold: 132,
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
