import { toNumber, normalizeArray } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PALETTE = ["#6ee7ff", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#fbbf24"];

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export default {
  id: "svgRings",
  type: "svg",
  name: "Decorative Rings",
  category: "Motion Graphics",
  defaultParams: {
    count: 4,
    colors: PALETTE,
    speed: 1,
    strokeWidth: 3,
    dashArray: "20 10",
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const count = toNumber(params.count, 4);
    const colors = normalizeArray(params.colors, PALETTE);
    const sw = toNumber(params.strokeWidth, 3);
    const dash = params.dashArray || "20 10";

    const cx = 960, cy = 540;
    const minR = 120, maxR = 420;

    // glow filter
    const defs = svgEl("defs");
    const filter = svgEl("filter", { id: "ringBlur", x: "-20%", y: "-20%", width: "140%", height: "140%" });
    const blur = svgEl("feGaussianBlur", { stdDeviation: "3", result: "blur" });
    const merge = svgEl("feMerge");
    merge.appendChild(svgEl("feMergeNode", { in: "blur" }));
    merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    const rings = [];
    for (let i = 0; i < count; i++) {
      const r = minR + ((maxR - minR) / Math.max(count - 1, 1)) * i;
      const color = colors[i % colors.length];
      const direction = i % 2 === 0 ? 1 : -1;
      const speedMul = 0.6 + (i * 0.3);

      const g = svgEl("g");
      const circle = svgEl("circle", {
        cx: String(cx), cy: String(cy), r: String(r),
        fill: "none", stroke: color, "stroke-width": String(sw + i * 0.5),
        "stroke-dasharray": dash, "stroke-linecap": "round",
        opacity: String(0.5 + i * 0.1), filter: "url(#ringBlur)",
      });
      g.appendChild(circle);
      svg.appendChild(g);
      rings.push({ g, direction, speedMul, cx, cy });
    }

    return { svg, rings, speed: toNumber(params.speed, 1) };
  },

  update(els, localT) {
    els.rings.forEach((ring) => {
      const deg = localT * 40 * els.speed * ring.speedMul * ring.direction;
      ring.g.setAttribute("transform", `rotate(${deg} ${ring.cx} ${ring.cy})`);
    });
  },

  destroy(els) { els.svg.remove(); },
};
