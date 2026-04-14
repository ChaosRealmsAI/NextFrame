export const meta = {
  id: "demoBarSvg",
  version: 1,
  ratio: "16:9",
  category: "data",
  label: "Demo Bar Chart SVG",
  description: "SVG 驱动的柱状图，5根柱子从底部动画升起，带标签和数值。展示数据驱动渲染。",
  tech: "svg",
  duration_hint: 7,
  loopable: false,
  z_hint: "middle",
  tags: ["bar-chart", "svg", "data", "animated", "demo"],
  mood: ["professional", "energetic"],
  theme: ["tech", "data", "minimal"],
  default_theme: "neon-blue",
  themes: {
    "neon-blue":   { barColor: "#4fc3f7", labelColor: "#e0f7fa", bgColor: "rgba(0,0,0,0)", accentColor: "#00bcd4" },
    "warm-amber":  { barColor: "#ffb74d", labelColor: "#fff8e1", bgColor: "rgba(0,0,0,0)", accentColor: "#ff8f00" },
    "cyber-green": { barColor: "#69f0ae", labelColor: "#e8f5e9", bgColor: "rgba(0,0,0,0)", accentColor: "#00e676" },
  },
  params: {
    barColor:    { type: "string", default: "#4fc3f7", label: "柱子颜色", semantic: "main bar fill color", group: "color" },
    labelColor:  { type: "string", default: "#e0f7fa", label: "标签颜色", semantic: "axis labels and value text color", group: "color" },
    bgColor:     { type: "string", default: "rgba(0,0,0,0)", label: "背景色", semantic: "chart background", group: "color" },
    accentColor: { type: "string", default: "#00bcd4", label: "强调色", semantic: "highlight color for bar top glow", group: "color" },
    title:       { type: "string", default: "数据驱动渲染", label: "图表标题", semantic: "chart title displayed above bars", group: "content" },
  },
  ai: {
    when: "需要展示数据可视化能力时使用，适合 demo、报告场景",
    how: "叠加在深色背景上，start=0 dur=7s",
    example: { barColor: "#4fc3f7", labelColor: "#e0f7fa", bgColor: "rgba(0,0,0,0)", accentColor: "#00bcd4", title: "数据驱动渲染" },
    theme_guide: { "neon-blue": "科技蓝", "warm-amber": "暖橙", "cyber-green": "赛博绿" },
    avoid: "不要在白色背景上使用默认浅色主题",
    pairs_with: ["demoBg", "demoProgress"],
  },
};

function ease(p) {
  const c = Math.max(0, Math.min(1, p));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export function render(t, params, vp) {
  const { barColor, labelColor, bgColor, accentColor, title } = params;
  const W = vp.width, H = vp.height;

  const bars = [
    { label: "Scene", value: 85 },
    { label: "Anim", value: 72 },
    { label: "Render", value: 94 },
    { label: "Export", value: 68 },
    { label: "Publish", value: 79 },
  ];

  const chartX = W * 0.15;
  const chartW = W * 0.7;
  const chartY = H * 0.18;
  const chartH = H * 0.58;
  const barW = chartW / bars.length * 0.55;
  const gap = chartW / bars.length;

  const animProgress = Math.min(1, t / 3);

  const barsSvg = bars.map((bar, i) => {
    const barStart = i * 0.15;
    const p = ease(Math.max(0, (animProgress - barStart * 0.9) / 0.7));
    const barH = chartH * (bar.value / 100) * p;
    const bx = chartX + gap * i + gap / 2 - barW / 2;
    const by = chartY + chartH - barH;
    const fontSize1 = Math.round(W * 0.018);
    const fontSize2 = Math.round(W * 0.015);

    return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, barH).toFixed(1)}" fill="${barColor}" rx="4" opacity="0.9"/>
    <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="4" fill="${accentColor}" rx="2" opacity="${p.toFixed(3)}"/>
    <text x="${(bx + barW / 2).toFixed(1)}" y="${(chartY + chartH + 30).toFixed(1)}" text-anchor="middle" fill="${labelColor}" font-size="${fontSize1}" font-family="system-ui,sans-serif">${bar.label}</text>
    <text x="${(bx + barW / 2).toFixed(1)}" y="${(by - 10).toFixed(1)}" text-anchor="middle" fill="${accentColor}" font-size="${fontSize2}" font-family="system-ui,sans-serif" opacity="${p.toFixed(3)}">${Math.round(bar.value * p)}%</text>`;
  }).join('\n    ');

  const titleOpacity = ease(Math.min(1, t / 1.5));
  const fontSize3 = Math.round(W * 0.03);
  const fontSize4 = Math.round(W * 0.016);

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%">
  <rect width="${W}" height="${H}" fill="${bgColor}"/>
  <text x="${W / 2}" y="${(H * 0.12).toFixed(1)}" text-anchor="middle" fill="${labelColor}" font-size="${fontSize3}" font-family="system-ui,sans-serif" font-weight="600" opacity="${titleOpacity.toFixed(3)}">${title}</text>
  <line x1="${chartX.toFixed(1)}" y1="${(chartY + chartH).toFixed(1)}" x2="${(chartX + chartW).toFixed(1)}" y2="${(chartY + chartH).toFixed(1)}" stroke="${labelColor}" stroke-width="1.5" opacity="0.3"/>
  <line x1="${chartX.toFixed(1)}" y1="${chartY.toFixed(1)}" x2="${chartX.toFixed(1)}" y2="${(chartY + chartH).toFixed(1)}" stroke="${labelColor}" stroke-width="1.5" opacity="0.3"/>
  ${barsSvg}
  <text x="${W / 2}" y="${(H * 0.9).toFixed(1)}" text-anchor="middle" fill="${labelColor}" font-size="${fontSize4}" font-family="system-ui,sans-serif" opacity="${(titleOpacity * 0.5).toFixed(3)}">SVG 原生渲染 — 每帧纯计算，无 DOM 状态</text>
</svg>`;
}

export function screenshots() {
  return [
    { t: 0, label: "初始（柱子未出现）" },
    { t: 2, label: "动画中" },
    { t: 6, label: "完成态" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.title) errors.push("title 不能为空");
  return { ok: errors.length === 0, errors };
}
