import {
  createRoot, smoothstep, easeOutCubic,
  toNumber, normalizeArray, SANS_FONT_STACK,
} from '../core/shared/index.js';

export default {
  id: "barChart",
  type: "dom",
  name: "Bar Chart (16:9)",
  category: "Data",
  ratio: "16:9",
  tags: ["chart", "bar", "data", "svg"],
  description: "SVG 柱状图，动画增长。1920x1080 专用",
  params: {
    data:      { type: "array",  default: [80, 55, 95, 40, 70], desc: "数值数组" },
    labels:    { type: "array",  default: ["A", "B", "C", "D", "E"], desc: "标签数组" },
    colors:    { type: "array",  default: ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa"], desc: "颜色数组" },
    labelSize: { type: "number", default: 24, desc: "标签字号(px)" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;width:1920px;height:1080px");

    const data = normalizeArray(p.data, [80, 55, 95, 40, 70]);
    const labels = normalizeArray(p.labels, ["A", "B", "C", "D", "E"]);
    const colors = normalizeArray(p.colors, ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa"]);
    const labelSize = toNumber(p.labelSize, 24);

    // Chart area: padding top 100, bottom 160, left 120, right 80
    const padTop = 100, padBot = 160, padLeft = 120, padRight = 80;
    const chartW = 1920 - padLeft - padRight;
    const chartH = 1080 - padTop - padBot;
    const maxVal = Math.max(...data, 1);
    const barCount = data.length;
    const barGap = 20;
    const barW = Math.min(120, (chartW - barGap * (barCount + 1)) / barCount);

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 1920 1080");
    svg.style.cssText = "width:100%;height:100%;";

    // axis line
    const axis = document.createElementNS(ns, "line");
    axis.setAttribute("x1", padLeft);
    axis.setAttribute("y1", 1080 - padBot);
    axis.setAttribute("x2", 1920 - padRight);
    axis.setAttribute("y2", 1080 - padBot);
    axis.setAttribute("stroke", "rgba(255,255,255,0.2)");
    axis.setAttribute("stroke-width", "2");
    svg.appendChild(axis);

    const bars = [];
    const totalBarArea = barW * barCount + barGap * (barCount - 1);
    const offsetX = padLeft + (chartW - totalBarArea) / 2;

    for (let i = 0; i < barCount; i++) {
      const x = offsetX + i * (barW + barGap);
      const fullH = (data[i] / maxVal) * chartH;
      const color = colors[i % colors.length] || "#60a5fa";

      // bar rect
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", 1080 - padBot);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", 0);
      rect.setAttribute("rx", 6);
      rect.setAttribute("fill", color);
      svg.appendChild(rect);

      // value label
      const val = document.createElementNS(ns, "text");
      val.setAttribute("x", x + barW / 2);
      val.setAttribute("y", 1080 - padBot - fullH - 12);
      val.setAttribute("text-anchor", "middle");
      val.setAttribute("fill", "rgba(255,255,255,0.8)");
      val.setAttribute("font-size", "22");
      val.setAttribute("font-family", SANS_FONT_STACK);
      val.setAttribute("opacity", "0");
      val.textContent = String(data[i]);
      svg.appendChild(val);

      // bottom label
      const lbl = document.createElementNS(ns, "text");
      lbl.setAttribute("x", x + barW / 2);
      lbl.setAttribute("y", 1080 - padBot + 36);
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("fill", "rgba(255,255,255,0.7)");
      lbl.setAttribute("font-size", String(labelSize));
      lbl.setAttribute("font-family", SANS_FONT_STACK);
      lbl.textContent = labels[i] || "";
      svg.appendChild(lbl);

      bars.push({ rect, val, fullH, baseY: 1080 - padBot });
    }

    root.appendChild(svg);
    return { root, bars };
  },

  update(els, localT) {
    const { bars } = els;
    const stagger = 0.12;
    for (let i = 0; i < bars.length; i++) {
      const t = smoothstep(0.2 + i * stagger, 0.6 + i * stagger, localT);
      const { rect, val, fullH, baseY } = bars[i];
      const h = fullH * t;
      rect.setAttribute("y", baseY - h);
      rect.setAttribute("height", h);
      val.setAttribute("opacity", t > 0.8 ? (t - 0.8) / 0.2 : 0);
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
