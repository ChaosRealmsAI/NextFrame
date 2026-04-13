import {
  createRoot, smoothstep, easeOutCubic,
  toNumber, normalizeArray, SANS_FONT_STACK,
} from '../core/scenes-v2-shared.js';

const DEFAULT_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa"];

export default {
  id: "barChart_43",
  type: "dom",
  name: "Bar Chart (4:3)",
  category: "Data",
  ratio: "4:3",
  tags: ["chart", "bar", "data", "ppt"],
  description: "4:3 PPT SVG 柱状图，动画增长。PPT 横屏专用",
  params: {
    data:      { type: "array",  default: [80, 55, 95, 40, 70], desc: "数值数组" },
    labels:    { type: "array",  default: ["A", "B", "C", "D", "E"], desc: "标签数组" },
    colors:    { type: "array",  default: DEFAULT_COLORS, desc: "颜色数组" },
    labelSize: { type: "number", default: 22, desc: "标签字号(px)" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const W = container.clientWidth;
    const H = container.clientHeight;
    const root = createRoot(container, `display:flex;align-items:center;justify-content:center;width:${W}px;height:${H}px`);

    const data = normalizeArray(p.data, [80, 55, 95, 40, 70]);
    const labels = normalizeArray(p.labels, ["A", "B", "C", "D", "E"]);
    const colors = normalizeArray(p.colors, DEFAULT_COLORS);
    const labelSize = toNumber(p.labelSize, 22);

    const padTop = 80, padBot = 140, padLeft = 100, padRight = 60;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBot;
    const maxVal = Math.max(...data, 1);
    const barCount = data.length;
    const barGap = 20;
    const barW = Math.min(100, (chartW - barGap * (barCount + 1)) / barCount);

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.style.cssText = "width:100%;height:100%;";

    const axis = document.createElementNS(ns, "line");
    axis.setAttribute("x1", padLeft);
    axis.setAttribute("y1", H - padBot);
    axis.setAttribute("x2", W - padRight);
    axis.setAttribute("y2", H - padBot);
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

      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", H - padBot);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", 0);
      rect.setAttribute("rx", 6);
      rect.setAttribute("fill", color);
      svg.appendChild(rect);

      const val = document.createElementNS(ns, "text");
      val.setAttribute("x", x + barW / 2);
      val.setAttribute("y", H - padBot - fullH - 10);
      val.setAttribute("text-anchor", "middle");
      val.setAttribute("fill", "rgba(255,255,255,0.8)");
      val.setAttribute("font-size", "20");
      val.setAttribute("font-family", SANS_FONT_STACK);
      val.setAttribute("opacity", "0");
      val.textContent = String(data[i]);
      svg.appendChild(val);

      const lbl = document.createElementNS(ns, "text");
      lbl.setAttribute("x", x + barW / 2);
      lbl.setAttribute("y", H - padBot + 34);
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("fill", "rgba(255,255,255,0.7)");
      lbl.setAttribute("font-size", String(labelSize));
      lbl.setAttribute("font-family", SANS_FONT_STACK);
      lbl.textContent = labels[i] || "";
      svg.appendChild(lbl);

      bars.push({ rect, val, fullH, baseY: H - padBot });
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
      const h = easeOutCubic(t) * fullH;
      rect.setAttribute("y", baseY - h);
      rect.setAttribute("height", h);
      val.setAttribute("opacity", t > 0.8 ? (t - 0.8) / 0.2 : 0);
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
