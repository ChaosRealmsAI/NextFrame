import { toNumber, normalizeArray } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_EVENTS = [
  { label: "Start", date: "Q1" },
  { label: "Develop", date: "Q2" },
  { label: "Test", date: "Q3" },
  { label: "Launch", date: "Q4" },
];

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); }
  return el;
}

export default {
  id: "timelineViz",
  type: "svg",
  name: "Timeline",
  category: "Data Viz",
  defaultParams: {
    events: DEFAULT_EVENTS,
    color: "#a78bfa",
    dotSize: 8,
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const events = normalizeArray(params.events, DEFAULT_EVENTS);
    const color = params.color || "#a78bfa";
    const dotR = toNumber(params.dotSize, 8);
    const count = events.length;
    const marginX = 240;
    const cy = 540;
    const lineY = cy;

    // Glow filter
    const defs = svgEl("defs");
    const filter = svgEl("filter", { id: "tlGlow", x: "-50%", y: "-50%", width: "200%", height: "200%" });
    filter.appendChild(svgEl("feGaussianBlur", { stdDeviation: "4", result: "blur" }));
    const merge = svgEl("feMerge");
    merge.appendChild(svgEl("feMergeNode", { in: "blur" }));
    merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Horizontal line
    const line = svgEl("line", {
      x1: String(marginX), y1: String(lineY),
      x2: String(1920 - marginX), y2: String(lineY),
      stroke: color, "stroke-width": "2", opacity: "0.3",
    });
    svg.appendChild(line);

    const nodes = [];
    for (let i = 0; i < count; i++) {
      const x = marginX + ((1920 - 2 * marginX) / Math.max(count - 1, 1)) * i;
      const g = svgEl("g", { opacity: "0" });

      const dot = svgEl("circle", {
        cx: String(x), cy: String(cy), r: String(dotR),
        fill: color, filter: "url(#tlGlow)",
      });
      g.appendChild(dot);

      const label = svgEl("text", {
        x: String(x), y: String(cy - 28),
        fill: "#fff", "font-size": "18", "text-anchor": "middle",
        "font-family": "-apple-system, sans-serif", "font-weight": "600",
      });
      label.textContent = events[i].label || "";
      g.appendChild(label);

      const date = svgEl("text", {
        x: String(x), y: String(cy + 36),
        fill: "rgba(255,255,255,0.45)", "font-size": "13", "text-anchor": "middle",
        "font-family": "-apple-system, sans-serif",
      });
      date.textContent = events[i].date || "";
      g.appendChild(date);

      svg.appendChild(g);
      nodes.push(g);
    }

    return { svg, nodes };
  },

  update(els, localT) {
    const count = els.nodes.length;
    for (let i = 0; i < count; i++) {
      const threshold = (i + 1) / (count + 1);
      // localT is seconds; reveal over first few seconds
      const progress = Math.min(1, localT / Math.max(count * 0.8, 2));
      const opacity = progress >= threshold ? 1 : 0;
      els.nodes[i].setAttribute("opacity", String(opacity));
    }
  },

  destroy(els) { els.svg.remove(); },
};
