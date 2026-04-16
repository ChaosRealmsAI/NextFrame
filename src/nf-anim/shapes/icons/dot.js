import { attrs, num } from "../shared.js";
// TODO: tune normalized SVG geometry for dot if spec shifts
const meta = { name: "dot", category: "icons", description: "Filled dot centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "radius", type: "number", default: 18, semantic: "circle radius in px" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function dot(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0; const radius = Math.max(1, num(layer.radius, 18));
  return `<circle${attrs({ cx: 0, cy: 0, r: radius, fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
dot.meta = meta;
export default dot;
