import { attrs, num } from "../shared.js";
// TODO: tune normalized SVG geometry for circle if spec shifts
const meta = { name: "circle", category: "geometric", description: "Circle centered at the origin", params: [{ name: "radius", type: "number", default: 48, semantic: "circle radius in px" }, { name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function circle(layer = {}) {
  const radius = Math.max(1, num(layer.radius, 48)); const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<circle${attrs({ cx: 0, cy: 0, r: radius, fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
circle.meta = meta;
export default circle;
