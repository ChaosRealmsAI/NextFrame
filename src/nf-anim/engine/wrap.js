import { attrs, num, slug, stable } from "../shapes/shared.js";

const meta = { name: "wrapFilters", kind: "engine", description: "Apply deterministic SVG filter wrappers to rendered layer fragments" };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fix = (v) => +v.toFixed(3);
// TODO: split filter builders if wrap coverage expands beyond glow/shadow/blur.

function buildFilter(kind, raw = {}) {
  const intensity = fix(clamp(num(raw.intensity, 0.5), 0, 1));
  const spread = fix(Math.max(0, num(raw.spread, 8)));
  const color = raw.color ?? (kind === "shadow" ? "#6f3b2c" : "#da7756");
  const pad = Math.round(kind === "blur" ? 45 + (intensity * 80) : 70 + (spread * 6));
  const id = slug(`wrap:${kind}:${stable({ color, intensity, spread })}`);
  if (kind === "glow") return { id, def: `<filter${attrs({ id, x: `-${pad}%`, y: `-${pad}%`, width: `${100 + (pad * 2)}%`, height: `${100 + (pad * 2)}%`, "color-interpolation-filters": "sRGB" })}><feGaussianBlur${attrs({ in: "SourceGraphic", stdDeviation: fix(Math.max(0.8, spread * (0.35 + intensity * 0.9))), result: "glow-blur" })}/><feFlood${attrs({ "flood-color": color, "flood-opacity": fix(0.18 + (intensity * 0.62)), result: "glow-color" })}/><feComposite${attrs({ in: "glow-color", in2: "glow-blur", operator: "in", result: "glow-mask" })}/><feMerge><feMergeNode in="glow-mask"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` };
  if (kind === "shadow") return { id, def: `<filter${attrs({ id, x: `-${pad}%`, y: `-${pad}%`, width: `${100 + (pad * 2)}%`, height: `${100 + (pad * 2)}%`, "color-interpolation-filters": "sRGB" })}><feOffset${attrs({ in: "SourceAlpha", dx: fix(spread * (0.18 + intensity * 0.24)), dy: fix(spread * (0.35 + intensity * 0.45)), result: "shadow-offset" })}/><feGaussianBlur${attrs({ in: "shadow-offset", stdDeviation: fix(Math.max(0.8, spread * (0.22 + intensity * 0.78))), result: "shadow-blur" })}/><feFlood${attrs({ "flood-color": color, "flood-opacity": fix(0.16 + (intensity * 0.48)), result: "shadow-color" })}/><feComposite${attrs({ in: "shadow-color", in2: "shadow-blur", operator: "in", result: "shadow-fill" })}/><feMerge><feMergeNode in="shadow-fill"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` };
  if (kind === "blur") return { id, def: `<filter${attrs({ id, x: `-${pad}%`, y: `-${pad}%`, width: `${100 + (pad * 2)}%`, height: `${100 + (pad * 2)}%`, "color-interpolation-filters": "sRGB" })}><feGaussianBlur${attrs({ in: "SourceGraphic", stdDeviation: fix(0.6 + (intensity * 11.4)) })}/></filter>` };
  return null;
}

export function wrapFilters(svgFragment = "", wrapSpec = {}) {
  const spec = typeof wrapSpec === "string" ? { [wrapSpec]: {} } : wrapSpec;
  const defs = [];
  let svg = svgFragment || "";
  for (const [kind, raw] of Object.entries(spec || {})) {
    const filter = buildFilter(kind, raw || {});
    if (!filter) continue;
    defs.push(filter.def);
    svg = `<g${attrs({ filter: `url(#${filter.id})` })}>${svg}</g>`;
  }
  return { svg, defs };
}

export { meta };
