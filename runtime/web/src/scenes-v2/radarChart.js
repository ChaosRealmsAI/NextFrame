import { clamp, easeOutCubic, toNumber, normalizeArray } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '-apple-system, "SF Pro Display", sans-serif';
const TAU = Math.PI * 2;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function polarXY(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export default {
  id: "radarChart",
  type: "svg",
  name: "Radar Chart",
  category: "Data Viz",
  defaultParams: {
    data: [85, 60, 75, 90, 50, 70],
    labels: ["Speed", "Power", "Range", "Armor", "Stealth", "Tech"],
    color: "#6ee7ff",
    fillOpacity: 0.25,
    maxValue: 100,
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const data = normalizeArray(params.data, [85, 60, 75, 90, 50, 70]);
    const labels = normalizeArray(params.labels, []);
    const color = params.color || "#6ee7ff";
    const fillOp = toNumber(params.fillOpacity, 0.25);
    const maxVal = toNumber(params.maxValue, 100);
    const n = data.length;

    const cx = 960, cy = 540, outerR = 340;
    const angleStep = TAU / n;
    const startAngle = -Math.PI / 2;

    // grid rings
    for (let ring = 1; ring <= 4; ring++) {
      const r = (outerR / 4) * ring;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = startAngle + i * angleStep;
        const p = polarXY(cx, cy, r, a);
        pts.push(`${p.x},${p.y}`);
      }
      svg.appendChild(svgEl("polygon", {
        points: pts.join(" "), fill: "none",
        stroke: "rgba(255,255,255,0.08)", "stroke-width": "1",
      }));
    }

    // axis lines
    for (let i = 0; i < n; i++) {
      const a = startAngle + i * angleStep;
      const p = polarXY(cx, cy, outerR, a);
      svg.appendChild(svgEl("line", {
        x1: String(cx), y1: String(cy), x2: String(p.x), y2: String(p.y),
        stroke: "rgba(255,255,255,0.1)", "stroke-width": "1",
      }));
    }

    // labels
    for (let i = 0; i < n; i++) {
      const a = startAngle + i * angleStep;
      const p = polarXY(cx, cy, outerR + 35, a);
      const anchor = Math.abs(p.x - cx) < 10 ? "middle" : p.x > cx ? "start" : "end";
      const txt = svgEl("text", {
        x: String(p.x), y: String(p.y + 6),
        fill: "rgba(255,255,255,0.6)", "font-size": "20",
        "font-family": FONT, "text-anchor": anchor,
      });
      txt.textContent = labels[i] || "";
      svg.appendChild(txt);
    }

    // data polygon
    const dataShape = svgEl("polygon", {
      points: Array(n).fill(`${cx},${cy}`).join(" "),
      fill: color, "fill-opacity": String(fillOp),
      stroke: color, "stroke-width": "2.5",
    });
    svg.appendChild(dataShape);

    // data dots
    const dots = [];
    for (let i = 0; i < n; i++) {
      const dot = svgEl("circle", {
        cx: String(cx), cy: String(cy), r: "5",
        fill: color, stroke: "#1a1a2e", "stroke-width": "2", opacity: "0",
      });
      svg.appendChild(dot);
      dots.push(dot);
    }

    // precompute target points
    const targets = data.map((v, i) => {
      const ratio = clamp(v / maxVal, 0, 1);
      const a = startAngle + i * angleStep;
      return polarXY(cx, cy, outerR * ratio, a);
    });

    return { svg, dataShape, dots, targets, cx, cy, n };
  },

  update(els, localT) {
    const raw = clamp(localT / 1.5, 0, 1);
    const t = easeOutCubic(raw);

    const pts = [];
    for (let i = 0; i < els.n; i++) {
      const tgt = els.targets[i];
      const x = els.cx + (tgt.x - els.cx) * t;
      const y = els.cy + (tgt.y - els.cy) * t;
      pts.push(`${x},${y}`);
      els.dots[i].setAttribute("cx", String(x));
      els.dots[i].setAttribute("cy", String(y));
      els.dots[i].setAttribute("opacity", String(clamp((raw - 0.3) * 3, 0, 1)));
    }
    els.dataShape.setAttribute("points", pts.join(" "));
  },

  destroy(els) { els.svg.remove(); },
};
