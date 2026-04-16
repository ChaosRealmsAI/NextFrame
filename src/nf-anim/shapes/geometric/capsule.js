import { attrs, num } from "../shared.js";
// TODO: tune normalized SVG geometry for capsule if spec shifts
const meta = { name: "capsule", category: "geometric", description: "Horizontal capsule centered at the origin", params: [{ name: "width", type: "number", default: 120, semantic: "capsule width in px" }, { name: "height", type: "number", default: 52, semantic: "capsule height in px" }, { name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function capsule(layer = {}) {
  const width = Math.max(2, num(layer.width, 120)); const height = Math.max(2, num(layer.height, 52)); const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<rect${attrs({ x: -width / 2, y: -height / 2, width, height, rx: height / 2, ry: height / 2, fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
capsule.meta = meta;
export default capsule;
