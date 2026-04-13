import { clamp, easeOutCubic, toNumber, normalizeArray } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '-apple-system, "SF Pro Display", sans-serif';
const PALETTE = ["#6ee7ff", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#fbbf24"];
const TAU = Math.PI * 2;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function polarToCart(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= TAU - 0.001) {
    const mid = startAngle + Math.PI;
    const s = polarToCart(cx, cy, r, startAngle);
    const m = polarToCart(cx, cy, r, mid);
    return `M${s.x},${s.y} A${r},${r} 0 1,1 ${m.x},${m.y} A${r},${r} 0 1,1 ${s.x},${s.y}`;
  }
  const s = polarToCart(cx, cy, r, startAngle);
  const e = polarToCart(cx, cy, r, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${s.x},${s.y} A${r},${r} 0 ${large},1 ${e.x},${e.y}`;
}

function sectorPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  if (innerR <= 0) {
    const a = arcPath(cx, cy, outerR, startAngle, endAngle);
    return endAngle - startAngle >= TAU - 0.001
      ? a + " Z"
      : a + ` L${cx},${cy} Z`;
  }
  const oStart = polarToCart(cx, cy, outerR, startAngle);
  const oEnd = polarToCart(cx, cy, outerR, endAngle);
  const iEnd = polarToCart(cx, cy, innerR, endAngle);
  const iStart = polarToCart(cx, cy, innerR, startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M${oStart.x},${oStart.y}`,
    `A${outerR},${outerR} 0 ${large},1 ${oEnd.x},${oEnd.y}`,
    `L${iEnd.x},${iEnd.y}`,
    `A${innerR},${innerR} 0 ${large},0 ${iStart.x},${iStart.y}`,
    "Z",
  ].join(" ");
}

export default {
  id: "pieChart",
  type: "svg",
  name: "Pie Chart",
  category: "Data Viz",
  defaultParams: {
    data: [35, 25, 20, 12, 8],
    labels: ["Design", "Dev", "Marketing", "Research", "Ops"],
    colors: PALETTE,
    innerRadius: 0,
    showLabels: true,
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const data = normalizeArray(params.data, [35, 25, 20, 12, 8]);
    const labels = normalizeArray(params.labels, []);
    const colors = normalizeArray(params.colors, PALETTE);
    const innerR = toNumber(params.innerRadius, 0);
    const showLabels = params.showLabels !== false;

    const cx = 960, cy = 540, outerR = 340;
    const total = data.reduce((s, v) => s + v, 0) || 1;

    // compute angles
    let cumAngle = -Math.PI / 2;
    const slices = data.map((val, i) => {
      const sweep = (val / total) * TAU;
      const start = cumAngle;
      cumAngle += sweep;
      return { val, start, sweep, color: colors[i % colors.length], label: labels[i] || "" };
    });

    // shadow filter
    const defs = svgEl("defs");
    const filter = svgEl("filter", { id: "pieShadow", x: "-20%", y: "-20%", width: "140%", height: "140%" });
    const blur = svgEl("feDropShadow", { dx: "0", dy: "4", stdDeviation: "8", "flood-color": "rgba(0,0,0,0.4)" });
    filter.appendChild(blur);
    defs.appendChild(filter);
    svg.appendChild(defs);

    const paths = slices.map((s) => {
      const path = svgEl("path", {
        d: sectorPath(cx, cy, outerR, innerR, s.start, s.start),
        fill: s.color, opacity: "0.9", filter: "url(#pieShadow)",
      });
      svg.appendChild(path);
      return path;
    });

    const lblEls = [];
    if (showLabels) {
      slices.forEach((s) => {
        const midAngle = s.start + s.sweep / 2;
        const lblR = outerR + 40;
        const pos = polarToCart(cx, cy, lblR, midAngle);
        const anchor = pos.x > cx ? "start" : "end";
        const txt = svgEl("text", {
          x: String(pos.x), y: String(pos.y + 6),
          fill: "rgba(255,255,255,0.7)", "font-size": "20",
          "font-family": FONT, "text-anchor": anchor, opacity: "0",
        });
        txt.textContent = s.label;
        svg.appendChild(txt);
        lblEls.push(txt);
      });
    }

    return { svg, paths, slices, cx, cy, outerR, innerR, lblEls };
  },

  update(els, localT) {
    const stagger = 0.15;
    const dur = 0.6;

    els.slices.forEach((s, i) => {
      const start = i * stagger;
      const raw = clamp((localT - start) / dur, 0, 1);
      const t = easeOutCubic(raw);
      const curSweep = s.sweep * t;
      const d = sectorPath(els.cx, els.cy, els.outerR, els.innerR, s.start, s.start + Math.max(curSweep, 0.001));
      els.paths[i].setAttribute("d", d);

      if (els.lblEls[i]) {
        els.lblEls[i].setAttribute("opacity", String(clamp((raw - 0.5) * 4, 0, 1)));
      }
    });
  },

  destroy(els) { els.svg.remove(); },
};
