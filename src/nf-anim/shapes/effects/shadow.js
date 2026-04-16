import { attrs, num, slug, stable } from "../shared.js";
// TODO: tune shadow offset and softness if the SVG filter contract evolves
const meta = { name: "shadow", category: "effects", description: "Wrap child layers with a soft drop-shadow filter", params: [{ name: "color", type: "color", default: "#6f3b2c", semantic: "shadow tint color" }, { name: "intensity", type: "number", default: 0.5, semantic: "0-1 strength that drives shadow blur and opacity" }, { name: "spread", type: "number", default: 8, semantic: "base shadow spread in px" }, { name: "children", type: "layer[]", default: [{ shape: "rect", width: 88, height: 58, radius: 16, fill: "#fff7ed" }], semantic: "child layers rendered above the shadow" }] };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function shadow(layer = {}) {
  const intensity = clamp(num(layer.intensity, 0.5), 0, 1), spread = Math.max(0, num(layer.spread, 8)), color = layer.color ?? "#6f3b2c";
  const dx = +(spread * (0.18 + intensity * 0.24)).toFixed(3), dy = +(spread * (0.35 + intensity * 0.45)).toFixed(3), blur = +(Math.max(0.8, spread * (0.22 + intensity * 0.78))).toFixed(3), alpha = +(0.16 + (intensity * 0.48)).toFixed(3), pad = Math.round(70 + (spread * 6));
  const children = layer.motion?.renderChildren?.(layer.children) || `<rect${attrs({ x: -44, y: -29, width: 88, height: 58, rx: 16, ry: 16, fill: layer.fill ?? "#fff7ed" })}/>`;
  const id = slug(`shadow:${stable({ color, intensity: +intensity.toFixed(3), spread: +spread.toFixed(3), children: layer.children || [] })}`);
  const filter = `<filter${attrs({ id, x: `-${pad}%`, y: `-${pad}%`, width: `${100 + (pad * 2)}%`, height: `${100 + (pad * 2)}%`, "color-interpolation-filters": "sRGB" })}><feOffset${attrs({ in: "SourceAlpha", dx, dy, result: "shadow-offset" })}/><feGaussianBlur${attrs({ in: "shadow-offset", stdDeviation: blur, result: "shadow-blur" })}/><feFlood${attrs({ "flood-color": color, "flood-opacity": alpha, result: "shadow-color" })}/><feComposite${attrs({ in: "shadow-color", in2: "shadow-blur", operator: "in", result: "shadow-fill" })}/><feMerge><feMergeNode in="shadow-fill"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  return `<g><defs>${filter}</defs><g${attrs({ filter: `url(#${id})` })}>${children}</g></g>`;
}
shadow.meta = meta;
export default shadow;
