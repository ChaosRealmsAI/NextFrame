import { toNumber, clamp } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;
const NUM_POINTS = 12;

function regularPolygon(sides, radius) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * TAU - Math.PI / 2;
    pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return pts;
}

function starPoints(outerR, innerR) {
  const pts = [];
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return pts;
}

function heartPoints(radius) {
  const pts = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    const t = (i / NUM_POINTS) * TAU;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push([x * radius / 18, y * radius / 18]);
  }
  return pts;
}

function circlePoints(radius) {
  const pts = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (i / NUM_POINTS) * TAU - Math.PI / 2;
    pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return pts;
}

function crossPoints(radius) {
  const w = radius * 0.35;
  const r = radius;
  return [
    [-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w],
    [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w],
  ];
}

function resampleTo(pts, count) {
  if (pts.length === count) return pts;
  const result = [];
  for (let i = 0; i < count; i++) {
    const frac = i / count * pts.length;
    const idx = Math.floor(frac);
    const t = frac - idx;
    const a = pts[idx % pts.length];
    const b = pts[(idx + 1) % pts.length];
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return result;
}

function getShape(name, radius) {
  switch (name) {
    case "circle":   return circlePoints(radius);
    case "square":   return resampleTo(regularPolygon(4, radius), NUM_POINTS);
    case "triangle": return resampleTo(regularPolygon(3, radius), NUM_POINTS);
    case "star":     return resampleTo(starPoints(radius, radius * 0.4), NUM_POINTS);
    case "hexagon":  return resampleTo(regularPolygon(6, radius), NUM_POINTS);
    case "heart":    return heartPoints(radius);
    case "diamond":  return resampleTo(regularPolygon(4, radius * 1.2), NUM_POINTS);
    case "cross":    return crossPoints(radius);
    default:         return circlePoints(radius);
  }
}

function pointsToPath(pts) {
  return "M" + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L") + "Z";
}

function lerpPoints(a, b, t) {
  return a.map((p, i) => [
    p[0] + (b[i][0] - p[0]) * t,
    p[1] + (b[i][1] - p[1]) * t,
  ]);
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); }
  return el;
}

export default {
  id: "morphShape",
  type: "svg",
  name: "Morph Shape",
  category: "Effects",
  tags: ["morph", "shape", "transform", "animation", "svg", "geometry"],
  description: "两个 SVG 形状之间平滑变形动画，内置 8 种基本形状，统一 12 点插值",
  params: {
    from:  { type: "string",  default: "circle",  desc: "起始形状" },
    to:    { type: "string",  default: "star",    desc: "目标形状" },
    color: { type: "string",  default: "#a78bfa",  desc: "颜色" },
    fill:  { type: "boolean", default: true,       desc: "是否填充" },
    size:     { type: "number",  default: 300,        desc: "形状大小", min: 50, max: 800 },
    duration: { type: "number",  default: 2,          desc: "变形动画时长(秒)", min: 0.1, max: 30 },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "-200 -200 400 400",
      style: "position:absolute;inset:0;width:100%;height:100%",
      preserveAspectRatio: "xMidYMid meet",
    });
    container.appendChild(svg);

    const color = params.color || "#a78bfa";
    const isFill = params.fill !== false;
    const radius = clamp(toNumber(params.size, 300), 50, 800) / 2;

    const fromPts = resampleTo(getShape(String(params.from || "circle"), radius), NUM_POINTS);
    const toPts = resampleTo(getShape(String(params.to || "star"), radius), NUM_POINTS);

    const path = svgEl("path", {
      d: pointsToPath(fromPts),
      fill: isFill ? color : "none",
      stroke: color,
      "stroke-width": isFill ? "0" : "3",
      "stroke-linejoin": "round",
    });
    svg.appendChild(path);

    return { svg, path, fromPts, toPts };
  },

  update(els, localT, params) {
    const duration = params.duration || 2;
    const raw = clamp(localT / duration, 0, 1);
    // ease in-out
    const t = raw < 0.5
      ? 2 * raw * raw
      : 1 - 2 * (1 - raw) * (1 - raw);
    const pts = lerpPoints(els.fromPts, els.toPts, t);
    els.path.setAttribute("d", pointsToPath(pts));
  },

  destroy(els) { els.svg.remove(); },
};
