import { attrs, num, slug, stable } from "../shared.js";
// TODO: tune glow falloff if the SVG filter contract evolves
const meta = { name: "glow", category: "effects", description: "Wrap child layers with a soft outer glow filter", params: [{ name: "color", type: "color", default: "#da7756", semantic: "glow tint color" }, { name: "intensity", type: "number", default: 0.5, semantic: "0-1 strength that drives glow blur and opacity" }, { name: "spread", type: "number", default: 8, semantic: "base glow spread in px" }, { name: "children", type: "layer[]", default: [{ shape: "circle", radius: 34, fill: "#fff7ed" }], semantic: "child layers rendered inside the glow wrapper" }] };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function glow(layer = {}) {
  const intensity = clamp(num(layer.intensity, 0.5), 0, 1), spread = Math.max(0, num(layer.spread, 8)), color = layer.color ?? "#da7756";
  const blur = +(Math.max(0.8, spread * (0.35 + intensity * 0.9))).toFixed(3), alpha = +(0.18 + (intensity * 0.62)).toFixed(3), pad = Math.round(70 + (spread * 6));
  const children = layer.motion?.renderChildren?.(layer.children) || `<circle${attrs({ cx: 0, cy: 0, r: 34, fill: layer.fill ?? "#fff7ed" })}/>`;
  const id = slug(`glow:${stable({ color, intensity: +intensity.toFixed(3), spread: +spread.toFixed(3), children: layer.children || [] })}`);
  const filter = `<filter${attrs({ id, x: `-${pad}%`, y: `-${pad}%`, width: `${100 + (pad * 2)}%`, height: `${100 + (pad * 2)}%`, "color-interpolation-filters": "sRGB" })}><feGaussianBlur${attrs({ in: "SourceGraphic", stdDeviation: blur, result: "glow-blur" })}/><feFlood${attrs({ "flood-color": color, "flood-opacity": alpha, result: "glow-color" })}/><feComposite${attrs({ in: "glow-color", in2: "glow-blur", operator: "in", result: "glow-mask" })}/><feMerge><feMergeNode in="glow-mask"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  return `<g><defs>${filter}</defs><g${attrs({ filter: `url(#${id})` })}>${children}</g></g>`;
}
glow.meta = meta;
export default glow;
