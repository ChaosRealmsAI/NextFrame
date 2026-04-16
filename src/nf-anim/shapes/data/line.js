import { attrs, pointsAttr } from "../shared.js";
// TODO: tune normalized SVG geometry for line if spec shifts
const meta = { name: "line", category: "data", description: "Polyline chart line from layer.points", params: [{ name: "points", type: "point[]", default: [[-50, 25], [-20, -10], [10, 0], [50, -35]], semantic: "ordered list of [x,y] points" }, { name: "stroke", type: "color", default: "#da7756", semantic: "line stroke color" }, { name: "strokeWidth", type: "number", default: 8, semantic: "stroke width in px" }] };
function line(layer = {}) {
  const fallback = [[-50, 25], [-20, -10], [10, 0], [50, -35]]; const stroke = layer.stroke ?? layer.fill ?? "#da7756"; const strokeWidth = layer.strokeWidth ?? 8;
  return `<polyline${attrs({ points: pointsAttr(layer.points, fallback), fill: "none", stroke, "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" })}/>`;
}
line.meta = meta;
export default line;
