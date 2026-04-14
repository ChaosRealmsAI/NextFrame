import {
  createRoot, createNode, smoothstep, easeOutCubic,
  toNumber, normalizeArray, SANS_FONT_STACK,
} from '../core/shared/index.js';

const DEFAULT_COLORS = ["#a0c4ff", "#ffc6ff", "#bdb2ff", "#caffbf", "#fdffb6"];

export default {
  id: "barChart_portrait",
  type: "dom",
  name: "Bar Chart (9:16)",
  category: "Data",
  ratio: "9:16",
  tags: ["chart", "bar", "data", "portrait"],
  description: "竖屏柱状图(SVG)，viewBox 1080x1920。1080x1920 专用",
  params: {
    data:      { type: "array",  default: [80, 55, 95, 40, 70], desc: "数值数组" },
    labels:    { type: "array",  default: ["A", "B", "C", "D", "E"], desc: "标签数组" },
    colors:    { type: "array",  default: DEFAULT_COLORS, desc: "柱颜色数组" },
    labelSize: { type: "number", default: 28, desc: "标签字号(px)" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;width:1080px;height:1920px");

    const data = normalizeArray(p.data, [80, 55, 95, 40, 70]);
    const labels = normalizeArray(p.labels, ["A", "B", "C", "D", "E"]);
    const colors = normalizeArray(p.colors, DEFAULT_COLORS);
    const labelSize = toNumber(p.labelSize, 28);

    const padLeft = 80;
    const padRight = 80;
    const padTop = 400;
    const padBottom = 400;
    const chartW = 1080 - padLeft - padRight;
    const chartH = 1920 - padTop - padBottom;

    const maxVal = Math.max(...data, 1);
    const barCount = data.length;
    const gap = 24;
    const barW = Math.max(20, (chartW - gap * (barCount - 1)) / barCount);

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 1080 1920");
    svg.setAttribute("width", "1080");
    svg.setAttribute("height", "1920");
    svg.style.cssText = "width:1080px;height:1920px;overflow:visible;opacity:0";
    root.appendChild(svg);

    const bars = [];
    const valueEls = [];

    for (let i = 0; i < barCount; i++) {
      const val = toNumber(data[i], 0);
      const barH = (val / maxVal) * chartH;
      const x = padLeft + i * (barW + gap);
      const y = padTop + chartH - barH;
      const color = colors[i % colors.length] || "#a0c4ff";

      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", padTop + chartH);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", 0);
      rect.setAttribute("rx", 6);
      rect.setAttribute("fill", color);
      svg.appendChild(rect);
      bars.push({ rect, targetY: y, targetH: barH });

      const valText = document.createElementNS(ns, "text");
      valText.setAttribute("x", x + barW / 2);
      valText.setAttribute("y", y - 16);
      valText.setAttribute("text-anchor", "middle");
      valText.setAttribute("fill", "rgba(255,255,255,0.8)");
      valText.setAttribute("font-family", SANS_FONT_STACK);
      valText.setAttribute("font-size", "24");
      valText.setAttribute("font-weight", "600");
      valText.setAttribute("opacity", "0");
      valText.textContent = String(val);
      svg.appendChild(valText);
      valueEls.push(valText);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", x + barW / 2);
      label.setAttribute("y", padTop + chartH + 40);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "rgba(255,255,255,0.7)");
      label.setAttribute("font-family", SANS_FONT_STACK);
      label.setAttribute("font-size", String(labelSize));
      label.textContent = String(labels[i] || "");
      svg.appendChild(label);
    }

    return { root, svg, bars, valueEls };
  },

  update(els, localT) {
    const { svg, bars, valueEls } = els;
    const fadeIn = smoothstep(0, 0.2, localT);
    svg.style.opacity = fadeIn;

    for (let i = 0; i < bars.length; i++) {
      const delay = 0.1 + i * 0.08;
      const t = easeOutCubic(smoothstep(delay, delay + 0.4, localT));
      const { rect, targetY, targetH } = bars[i];
      const h = t * targetH;
      const baseY = targetY + targetH;
      rect.setAttribute("y", baseY - h);
      rect.setAttribute("height", h);

      const valT = smoothstep(delay + 0.3, delay + 0.5, localT);
      valueEls[i].setAttribute("opacity", String(valT));
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
