import { smoothstep, easeOutBack, clamp, toNumber, normalizeArray, SANS_FONT_STACK, MONO_FONT_STACK, getStageSize } from "../scenes-v2-shared.js";

const NS = "http://www.w3.org/2000/svg";

function createSvg(W, H) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:hidden";
  return svg;
}

export default {
  id: "barChart",
  type: "svg",
  name: "Bar Chart",
  category: "Data Viz",
  tags: ["chart", "bar", "data", "visualization", "svg", "animated"],
  description: "Adaptive bar chart with easeOutBack bounce animation and staggered reveal per bar",

  params: {
    data:    { type: "array",  default: [40, 70, 55, 90],         desc: "Bar values" },
    labels:  { type: "array",  default: ["A", "B", "C", "D"],    desc: "Bar labels" },
    colors:  { type: "array",  default: ["#6ee7ff", "#a78bfa", "#f472b6", "#ffd93d"], desc: "Bar colors" },
    stagger: { type: "number", default: 0.12, min: 0, max: 1,    desc: "Stagger delay between bars (s)" },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const { width: fallbackW, height: fallbackH } = getStageSize(container);
    const W = Math.max(container.clientWidth || fallbackW, 1);
    const H = Math.max(container.clientHeight || fallbackH, 1);
    const S = Math.min(W, H);

    const data    = normalizeArray(params.data,   this.params.data.default);
    const labels  = normalizeArray(params.labels, this.params.labels.default);
    const colors  = normalizeArray(params.colors, this.params.colors.default);

    const svg = createSvg(W, H);
    container.appendChild(svg);

    const padL = W * 0.1;
    const padR = W * 0.06;
    const padT = H * 0.12;
    const padB = H * 0.16;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const chartBottom = padT + chartH;
    const maxVal = Math.max(1, ...data);

    const barW = chartW / (data.length * 2);
    const gap = barW;
    const labelFs = S * 0.018;
    const valueFs = S * 0.02;

    const bars = [];

    for (let i = 0; i < data.length; i++) {
      const val = toNumber(data[i], 0);
      const barH = (val / maxVal) * chartH;
      const x = padL + i * (barW + gap) + gap / 2;
      const y = chartBottom - barH;
      const color = colors[i % colors.length];

      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", chartBottom);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", 0);
      rect.setAttribute("rx", Math.min(barW * 0.15, S * 0.005));
      rect.setAttribute("fill", color);
      svg.appendChild(rect);

      const valueTxt = document.createElementNS(NS, "text");
      valueTxt.setAttribute("x", x + barW / 2);
      valueTxt.setAttribute("y", y - S * 0.008);
      valueTxt.setAttribute("text-anchor", "middle");
      valueTxt.setAttribute("font-family", MONO_FONT_STACK);
      valueTxt.setAttribute("font-size", valueFs);
      valueTxt.setAttribute("font-weight", "700");
      valueTxt.setAttribute("fill", color);
      valueTxt.setAttribute("opacity", "0");
      valueTxt.textContent = String(Math.round(val));
      svg.appendChild(valueTxt);

      const labelTxt = document.createElementNS(NS, "text");
      labelTxt.setAttribute("x", x + barW / 2);
      labelTxt.setAttribute("y", chartBottom + labelFs * 1.4);
      labelTxt.setAttribute("text-anchor", "middle");
      labelTxt.setAttribute("font-family", SANS_FONT_STACK);
      labelTxt.setAttribute("font-size", labelFs);
      labelTxt.setAttribute("font-weight", "600");
      labelTxt.setAttribute("fill", "rgba(200,210,230,0.85)");
      labelTxt.textContent = labels[i] || "";
      svg.appendChild(labelTxt);

      bars.push({ rect, valueTxt, x, y, barH, chartBottom });
    }

    // baseline
    const baseline = document.createElementNS(NS, "line");
    baseline.setAttribute("x1", padL);
    baseline.setAttribute("y1", chartBottom);
    baseline.setAttribute("x2", padL + chartW);
    baseline.setAttribute("y2", chartBottom);
    baseline.setAttribute("stroke", "rgba(255,255,255,0.15)");
    baseline.setAttribute("stroke-width", Math.max(1, S * 0.001));
    svg.appendChild(baseline);

    return { svg, bars, stagger: toNumber(params.stagger, 0.12) };
  },

  update(els, localT, params) {
    const { bars, stagger } = els;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const delay = i * stagger;
      const t = clamp((localT - delay) / 0.6, 0, 1);
      const progress = easeOutBack(clamp(t));

      const currentH = b.barH * progress;
      const currentY = b.chartBottom - currentH;
      b.rect.setAttribute("y", currentY);
      b.rect.setAttribute("height", Math.max(0, currentH));

      b.valueTxt.setAttribute("opacity", String(smoothstep(0.3, 0.7, t)));
      b.valueTxt.setAttribute("y", currentY - 4);
    }
  },

  destroy(els) {
    if (els.svg && els.svg.parentNode) {
      els.svg.parentNode.removeChild(els.svg);
    }
  },
};
