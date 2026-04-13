import { toNumber, normalizeArray, clamp } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_STEPS = [
  { label: "Input" }, { label: "Process" }, { label: "Validate" }, { label: "Output" },
];

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); }
  return el;
}

export default {
  id: "flowChart",
  type: "svg",
  name: "Flow Chart",
  category: "Data Viz",
  defaultParams: {
    steps: DEFAULT_STEPS,
    color: "#6ee7ff",
    arrowColor: "#a78bfa",
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const steps = normalizeArray(params.steps, DEFAULT_STEPS);
    const color = params.color || "#6ee7ff";
    const arrowColor = params.arrowColor || "#a78bfa";
    const count = clamp(steps.length, 2, 6);
    const boxW = 200, boxH = 80, cy = 540;
    const totalW = count * boxW + (count - 1) * 100;
    const startX = (1920 - totalW) / 2;

    // Defs: arrow marker + glow
    const defs = svgEl("defs");
    const marker = svgEl("marker", {
      id: "fcArrow", viewBox: "0 0 10 10", refX: "10", refY: "5",
      markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse",
    });
    const path = svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: arrowColor });
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const boxes = [];
    const arrows = [];

    for (let i = 0; i < count; i++) {
      const x = startX + i * (boxW + 100);
      const g = svgEl("g", { opacity: "0" });

      const rect = svgEl("rect", {
        x: String(x), y: String(cy - boxH / 2),
        width: String(boxW), height: String(boxH),
        rx: "12", fill: "rgba(255,255,255,0.06)",
        stroke: color, "stroke-width": "1.5",
      });
      g.appendChild(rect);

      const text = svgEl("text", {
        x: String(x + boxW / 2), y: String(cy + 6),
        fill: "#fff", "font-size": "17", "text-anchor": "middle",
        "font-family": "-apple-system, sans-serif", "font-weight": "600",
      });
      text.textContent = (steps[i] && steps[i].label) || `Step ${i + 1}`;
      g.appendChild(text);

      svg.appendChild(g);
      boxes.push(g);

      // Arrow between boxes
      if (i < count - 1) {
        const ax1 = x + boxW + 8;
        const ax2 = x + boxW + 100 - 8;
        const arrow = svgEl("line", {
          x1: String(ax1), y1: String(cy),
          x2: String(ax2), y2: String(cy),
          stroke: arrowColor, "stroke-width": "2",
          "marker-end": "url(#fcArrow)", opacity: "0",
        });
        svg.appendChild(arrow);
        arrows.push(arrow);
      }
    }

    return { svg, boxes, arrows };
  },

  update(els, localT) {
    const total = els.boxes.length + els.arrows.length;
    const progress = Math.min(1, localT / Math.max(total * 0.5, 2));

    let idx = 0;
    for (let i = 0; i < els.boxes.length; i++) {
      const threshold = (idx + 1) / (total + 1);
      els.boxes[i].setAttribute("opacity", progress >= threshold ? "1" : "0");
      idx++;
      if (i < els.arrows.length) {
        const aThreshold = (idx + 1) / (total + 1);
        els.arrows[i].setAttribute("opacity", progress >= aThreshold ? "1" : "0");
        idx++;
      }
    }
  },

  destroy(els) { els.svg.remove(); },
};
