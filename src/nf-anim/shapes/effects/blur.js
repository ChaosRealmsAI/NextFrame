import { attrs, num, slug, stable } from "../shared.js";
// TODO: tune blur softness if the SVG filter contract evolves
const meta = { name: "blur", category: "effects", description: "Wrap child layers with a Gaussian blur filter", params: [{ name: "color", type: "color", default: "#da7756", semantic: "fallback child fill color when no children are provided" }, { name: "intensity", type: "number", default: 0.5, semantic: "0-1 strength that drives blur radius" }, { name: "children", type: "layer[]", default: [{ shape: "circle", radius: 36, fill: "#da7756" }], semantic: "child layers rendered inside the blur wrapper" }] };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function blur(layer = {}) {
  const intensity = clamp(num(layer.intensity, 0.5), 0, 1), color = layer.color ?? "#da7756", blurRadius = +(0.6 + (intensity * 11.4)).toFixed(3), pad = Math.round(45 + (intensity * 80));
  const children = layer.motion?.renderChildren?.(layer.children) || `<circle${attrs({ cx: 0, cy: 0, r: 36, fill: layer.fill ?? color })}/>`;
  const id = slug(`blur:${stable({ color, intensity: +intensity.toFixed(3), children: layer.children || [] })}`);
  const filter = `<filter${attrs({ id, x: `-${pad}%`, y: `-${pad}%`, width: `${100 + (pad * 2)}%`, height: `${100 + (pad * 2)}%`, "color-interpolation-filters": "sRGB" })}><feGaussianBlur${attrs({ in: "SourceGraphic", stdDeviation: blurRadius })}/></filter>`;
  return `<g><defs>${filter}</defs><g${attrs({ filter: `url(#${id})` })}>${children}</g></g>`;
}
blur.meta = meta;
export default blur;
