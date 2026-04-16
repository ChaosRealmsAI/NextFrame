// scenes/16x9/warm-editorial/data-compactChart.js
//
// compactChart — 迷你折线图。SVG viewBox 内画坐标轴 + 折线 + 数据点圆点。
// ink 色线条，ac 色数据点。参数：dataPoints 数组。

export default {
  id: "compactChart",
  name: "compactChart",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "data",

  description: "迷你折线图 — SVG 坐标轴 + ink 色折线 + ac 色数据点圆点，杂志内嵌数据可视化",
  duration_hint: null,

  type: "svg",
  frame_pure: false,
  assets: [],

  intent: `杂志里的数据图表和 Excel 图表的区别在于「克制」— KINFOLK / Monocle 的图表从不用彩虹配色，只用一种墨色画线、一种强调色点数据点。这个组件做的是最小化的折线图：ink (#2c2418) 色坐标轴和折线，ac (#c45a3c) 砖红色数据点圆点。没有网格线、没有图例、没有多余装饰 — 数据本身就是装饰。SVG viewBox 让图表在任何分辨率下都锐利。折线用 stroke-dashoffset 动画做 t-driven 的「画线」效果（verb: draw），数据点在折线画到时逐个淡入（verb: reveal）。适合在 content-editorial 旁边做数据佐证，或单独做一帧「用一张图说明趋势」。`,

  when_to_use: [
    "趋势数据展示（增长 / 下降 / 波动）",
    "content-editorial 的数据佐证配图",
    "需要杂志级审美的简洁数据可视化",
  ],

  when_not_to_use: [
    "数据点 > 12 个（太密挤在一起）",
    "需要多条折线对比（只做单线）",
    "需要精确数值标注（这是概览图，不是精确图表）",
  ],

  limitations: [
    "dataPoints 数组长度 ≤ 12",
    "Y 值自动归一化（0 到 max），不支持负值",
    "只画单条折线，不支持多系列",
  ],

  inspired_by: "Monocle 杂志内嵌迷你图 + KINFOLK 数据页 + Edward Tufte sparkline",
  used_in: [],

  requires: [],
  pairs_well_with: ["content-editorial", "chrome-bookSpine", "bg-paperGrain"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "mid",
  mood: ["analytical", "clean", "editorial"],

  tags: ["data", "chart", "line", "sparkline", "svg", "warm-editorial"],

  complexity: "medium",
  performance: { cost: "low", notes: "纯 SVG，stroke-dashoffset + 逐点 opacity" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial for warm-editorial · 迷你折线图" },
  ],

  params: {
    dataPoints: {
      type: "array",
      required: true,
      semantic: "数据点数组（数值），例 [12, 28, 19, 45, 38, 52, 41, 60]",
    },
    label: {
      type: "string",
      default: "",
      semantic: "图表标题（左上角 caption 字号）",
    },
    unit: {
      type: "string",
      default: "",
      semantic: "Y 轴单位标注（右上角）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const raw = Array.isArray(params.dataPoints) ? params.dataPoints : [];
    const data = raw.slice(0, 12).map(Number).filter(Number.isFinite);
    const label = String(params.label || "");
    const unit = String(params.unit || "");

    const W = vp.width;
    const H = vp.height;

    if (data.length < 2) {
      host.innerHTML = "";
      return;
    }

    // chart area within viewport
    const chartW = W * 0.5;
    const chartH = H * 0.45;
    const chartX = (W - chartW) / 2;
    const chartY = (H - chartH) / 2;
    const padL = 40;
    const padR = 20;
    const padT = 40;
    const padB = 30;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;

    const maxVal = Math.max(...data);
    const minVal = 0;
    const range = maxVal - minVal || 1;

    // compute points
    const points = data.map((v, i) => {
      const x = chartX + padL + (i / (data.length - 1)) * plotW;
      const y = chartY + padT + plotH - ((v - minVal) / range) * plotH;
      return { x, y, v };
    });

    // polyline path
    const polyline = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    // total path length estimate
    let totalLen = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      totalLen += Math.sqrt(dx * dx + dy * dy);
    }

    // draw animation: 0 → 1.2s
    const drawDur = 1.2;
    const pDraw = Math.min(Math.max(t / drawDur, 0), 1);
    const drawEase = 1 - Math.pow(1 - pDraw, 3);
    const dashOffset = totalLen * (1 - drawEase);

    // overall opacity
    const opacity = Math.min(t / 0.3, 1);

    // axis lines
    const axisX1 = chartX + padL;
    const axisX2 = chartX + padL + plotW;
    const axisY1 = chartY + padT;
    const axisY2 = chartY + padT + plotH;

    const safe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // data point dots — reveal as line reaches them
    const dotsSvg = points.map((p, i) => {
      const progress = i / (data.length - 1);
      const dotVisible = drawEase >= progress;
      const dotOpacity = dotVisible ? Math.min((drawEase - progress) * (data.length - 1) / 0.5, 1) : 0;
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"
                fill="#c45a3c" opacity="${dotOpacity.toFixed(3)}"/>`;
    }).join("\n");

    host.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
           style="position:absolute;inset:0;display:block;opacity:${opacity.toFixed(3)};">

        <!-- label -->
        ${label ? `<text x="${axisX1}" y="${chartY + 20}" font-family="'Helvetica Neue', 'PingFang SC', system-ui, sans-serif"
              font-size="22" fill="rgba(44,36,24,.6)">${safe(label)}</text>` : ""}

        <!-- unit -->
        ${unit ? `<text x="${axisX2}" y="${chartY + 20}" text-anchor="end"
              font-family="'SF Mono', 'JetBrains Mono', Consolas, monospace"
              font-size="18" fill="rgba(44,36,24,.6)">${safe(unit)}</text>` : ""}

        <!-- Y axis -->
        <line x1="${axisX1}" y1="${axisY1}" x2="${axisX1}" y2="${axisY2}"
              stroke="rgba(44,36,24,.25)" stroke-width="1"/>

        <!-- X axis -->
        <line x1="${axisX1}" y1="${axisY2}" x2="${axisX2}" y2="${axisY2}"
              stroke="rgba(44,36,24,.25)" stroke-width="1"/>

        <!-- polyline (draw animation) -->
        <path d="${polyline}" fill="none" stroke="#2c2418" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="${totalLen.toFixed(1)}"
              stroke-dashoffset="${dashOffset.toFixed(1)}"/>

        <!-- data points -->
        ${dotsSvg}
      </svg>
    `;
  },

  describe(t, params, vp) {
    const data = Array.isArray(params.dataPoints) ? params.dataPoints.slice(0, 12) : [];
    const progress = Math.min(1, Math.max(0, t / 1.2));
    return {
      sceneId: "compactChart",
      phase: progress < 1 ? "draw" : "show",
      progress,
      visible: data.length >= 2,
      params,
      elements: [
        { type: "axis", role: "frame" },
        { type: "polyline", role: "data-line", pointCount: data.length },
        { type: "dots", role: "data-points", count: data.length },
        { type: "label", role: "caption", value: params.label || "" },
      ],
      boundingBox: { x: vp.width * 0.25, y: vp.height * 0.275, w: vp.width * 0.5, h: vp.height * 0.45 },
    };
  },

  sample() {
    return {
      dataPoints: [12, 28, 19, 45, 38, 52, 41, 60, 55, 72],
      label: "年均阅读量（本）",
      unit: "册 / 年",
    };
  },
};
