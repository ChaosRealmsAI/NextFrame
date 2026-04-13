import { smoothstep, resolveSize, clamp, toNumber, toBoolean, normalizeArray, SANS_FONT_STACK, MONO_FONT_STACK, getStageSize } from "../scenes-v2-shared.js";

const NS = "http://www.w3.org/2000/svg";

export default {
  id: "lineChart",
  type: "svg",
  name: "Line Chart",
  category: "Data Viz",
  tags: ["chart", "line", "data", "visualization", "svg", "animated", "area"],
  description: "Adaptive line chart with stroke-dashoffset draw animation, optional dots and filled area",

  params: {
    data:     { type: "array",   default: [20, 45, 35, 70, 55],              desc: "Data values" },
    labels:   { type: "array",   default: ["W1", "W2", "W3", "W4", "W5"],   desc: "X-axis labels" },
    color:    { type: "color",   default: "#6ee7ff",                          desc: "Line color" },
    showDots: { type: "boolean", default: true,                               desc: "Show data point dots" },
    showArea: { type: "boolean", default: true,                               desc: "Show filled area under line" },
    labelSize: { type: "number", default: 0.022, desc: "Label font size as a ratio of the short edge (or px/keyword)" },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const stage = getStageSize(container);
    const W = Math.max(container.clientWidth || stage.width, 1);
    const H = Math.max(container.clientHeight || stage.height, 1);
    const S = Math.min(stage.width || W, stage.height || H); // stage-based for stable font size

    const data   = normalizeArray(params.data,   this.params.data.default);
    const labels = normalizeArray(params.labels, this.params.labels.default);
    const color  = params.color || this.params.color.default;
    const showDots = toBoolean(params.showDots, true);
    const showArea = toBoolean(params.showArea, true);

    const lineW  = S * 0.003;
    const dotR   = S * 0.006;
    const labelFs = resolveSize(params.labelSize, S, 0.022);

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:hidden";
    container.appendChild(svg);

    const padL = W * 0.1;
    const padR = W * 0.06;
    const padT = H * 0.12;
    const padB = H * 0.16;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const chartBottom = padT + chartH;
    const maxVal = Math.max(1, ...data);

    // Build points
    const points = data.map((val, i) => {
      const x = padL + (i / Math.max(1, data.length - 1)) * chartW;
      const y = chartBottom - (toNumber(val, 0) / maxVal) * chartH;
      return { x, y };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    // Area fill
    let areaEl = null;
    if (showArea) {
      const areaD = pathD + ` L ${points[points.length - 1].x} ${chartBottom} L ${points[0].x} ${chartBottom} Z`;
      areaEl = document.createElementNS(NS, "path");
      areaEl.setAttribute("d", areaD);
      areaEl.setAttribute("fill", color);
      areaEl.setAttribute("fill-opacity", "0");
      svg.appendChild(areaEl);
    }

    // Line
    const line = document.createElementNS(NS, "path");
    line.setAttribute("d", pathD);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", lineW);
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);

    // Measure total length for dashoffset animation
    const totalLen = line.getTotalLength();
    line.setAttribute("stroke-dasharray", totalLen);
    line.setAttribute("stroke-dashoffset", totalLen);

    // Dots
    const dots = [];
    if (showDots) {
      for (const p of points) {
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", p.x);
        circle.setAttribute("cy", p.y);
        circle.setAttribute("r", dotR);
        circle.setAttribute("fill", color);
        circle.setAttribute("opacity", "0");
        svg.appendChild(circle);
        dots.push(circle);
      }
    }

    // Labels
    for (let i = 0; i < points.length; i++) {
      const lbl = document.createElementNS(NS, "text");
      lbl.setAttribute("x", points[i].x);
      lbl.setAttribute("y", chartBottom + labelFs * 1.4);
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("font-family", SANS_FONT_STACK);
      lbl.setAttribute("font-size", labelFs);
      lbl.setAttribute("font-weight", "600");
      lbl.setAttribute("fill", "rgba(200,210,230,0.85)");
      lbl.textContent = labels[i] || "";
      svg.appendChild(lbl);
    }

    // Baseline
    const baseline = document.createElementNS(NS, "line");
    baseline.setAttribute("x1", padL);
    baseline.setAttribute("y1", chartBottom);
    baseline.setAttribute("x2", padL + chartW);
    baseline.setAttribute("y2", chartBottom);
    baseline.setAttribute("stroke", "rgba(255,255,255,0.15)");
    baseline.setAttribute("stroke-width", Math.max(1, S * 0.001));
    svg.appendChild(baseline);

    return { svg, line, totalLen, dots, areaEl, dataLen: data.length };
  },

  update(els, localT, _params) {
    const { line, totalLen, dots, areaEl, dataLen } = els;
    const drawProgress = clamp(localT / 1.8, 0, 1);
    const eased = smoothstep(0, 1, drawProgress);

    line.setAttribute("stroke-dashoffset", String(totalLen * (1 - eased)));

    if (areaEl) {
      areaEl.setAttribute("fill-opacity", String(eased * 0.15));
    }

    for (let i = 0; i < dots.length; i++) {
      const threshold = i / Math.max(1, dataLen - 1);
      const dotAlpha = smoothstep(threshold - 0.05, threshold + 0.05, eased);
      dots[i].setAttribute("opacity", String(dotAlpha));
    }
  },

  destroy(els) {
    if (els.svg && els.svg.parentNode) {
      els.svg.parentNode.removeChild(els.svg);
    }
  },
};
