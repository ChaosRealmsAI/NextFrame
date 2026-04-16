import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for triangle if spec shifts
const meta = { name: "triangle", category: "geometric", description: "Equilateral triangle centered at the origin", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function triangle(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<polygon${attrs({ points: "0,-58 50,34 -50,34", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
triangle.meta = meta;
export default triangle;
