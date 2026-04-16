// scenes/16x9/warm-editorial/data-compactChart.js
// Compact SVG line chart — editorial inline data viz.

export default {
  id: "compactChart",
  name: "紧凑折线图",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "data",
  description: "SVG 折线图：坐标轴 + ink 折线 + ac 数据点 + 顶部标题 + 数值标签",
  duration_hint: 3,
  type: "dom",
  frame_pure: false,
  assets: [],
  intent: `
    warm-editorial 主题的内嵌数据可视化组件。设计取舍：
    1. 全 SVG 矢量 — 数据要精确，不用 canvas 的模糊缩放。
    2. 坐标轴极细（1px ink-60）— 数据是主角，轴是辅助，减到最细。
    3. 折线 ink 深棕 + 数据点 ac 砖红圆 — 单色线 + 单色点，克制不花哨。
    4. 数据点 stroke-dashoffset 驱动折线从左到右"画"出来 — t=0 是一个点，t=dur 画到尾。
    5. 顶部标题 serif + 右上角趋势标识 sans — 层级清楚，是杂志式信息图表的做法。
    6. 最多 10 个数据点 — 更多就密，不适合 editorial 镜头。
  `,
  when_to_use: ["讲趋势 / 对比增长", "引用研究报告中的数据", "类比数字 / 周期"],
  when_not_to_use: ["柱状对比（用 data-bar）", "数据 > 10 点（信息过密）"],
  limitations: ["数据点 ≤ 10", "y 轴范围需由组件自动或 params 指定"],
  inspired_by: "FT Graphics / Monocle Forecast 数据图表",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-editorial"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["analytical", "calm"],
  tags: ["chart", "line", "data", "svg"],
  complexity: "medium",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    title: { type: "string", default: "年度纸书销量", semantic: "图表标题" },
    unit: { type: "string", default: "万册", semantic: "Y 轴单位" },
    dataPoints: { type: "array", required: true, semantic: "{ label, value } 数组，推荐 5-10 点" },
  },
  enter: null,
  exit: null,
  render(host, t, params, vp) {
    const title = escapeXml(params.title || "年度纸书销量");
    const unit = escapeXml(params.unit || "万册");
    const data = Array.isArray(params.dataPoints) ? params.dataPoints : [];
    const chartW = 1200;
    const chartH = 520;
    const padL = 100, padR = 100, padT = 80, padB = 80;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const maxV = Math.max(...data.map(d => Number(d.value) || 0), 1);
    // t-driven progressive reveal
    const drawDur = 1.8;
    const p = Math.min(Math.max(t / drawDur, 0), 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const shown = Math.floor(eased * data.length);
    const points = data.map((d, i) => {
      const x = padL + (plotW * i) / Math.max(1, data.length - 1);
      const y = padT + plotH - (plotH * (Number(d.value) || 0)) / maxV;
      return { x, y, label: d.label, value: d.value };
    });
    const pathD = points
      .slice(0, Math.max(1, shown))
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(" ");
    host.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vp.width} ${vp.height}" width="100%" height="100%" style="background: #f7f3ec">
        <g transform="translate(${(vp.width - chartW) / 2} ${(vp.height - chartH) / 2})">
          <text x="${padL}" y="50" fill="#2c2418" font-family="Georgia, 'Noto Serif SC', serif" font-size="36" font-weight="400">${title}</text>
          <text x="${chartW - padR}" y="50" fill="#8b6b4a" font-family="'Helvetica Neue', sans-serif" font-size="22" text-anchor="end" letter-spacing="0.08em">${unit.toUpperCase()}</text>
          <line x1="${padL}" y1="${padT + plotH}" x2="${chartW - padR}" y2="${padT + plotH}" stroke="rgba(44,36,24,.3)" stroke-width="1"/>
          <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="rgba(44,36,24,.3)" stroke-width="1"/>
          <path d="${pathD}" fill="none" stroke="#2c2418" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${points.slice(0, shown).map((pt, i) => `
            <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="7" fill="#c45a3c"/>
            <text x="${pt.x.toFixed(1)}" y="${(pt.y - 20).toFixed(1)}" fill="#2c2418" font-family="'SF Mono', monospace" font-size="18" text-anchor="middle">${pt.value}</text>
            <text x="${pt.x.toFixed(1)}" y="${(padT + plotH + 32).toFixed(1)}" fill="rgba(44,36,24,.6)" font-family="'Helvetica Neue', sans-serif" font-size="16" text-anchor="middle">${escapeXml(pt.label || "")}</text>
          `).join("")}
        </g>
      </svg>
    `;
  },
  describe(t, params, vp) {
    return { sceneId: "compactChart", phase: t < 1.8 ? "drawing" : "show", progress: Math.min(1, t / 1.8), visible: true, params, viewport: vp };
  },
  sample() {
    return {
      title: "精装书销量（年）",
      unit: "万册",
      dataPoints: [
        { label: "2018", value: 82 },
        { label: "2019", value: 88 },
        { label: "2020", value: 95 },
        { label: "2021", value: 118 },
        { label: "2022", value: 142 },
        { label: "2023", value: 156 },
        { label: "2024", value: 173 },
      ],
    };
  },
};

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
