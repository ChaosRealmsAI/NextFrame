import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for hexagon if spec shifts
const meta = { name: "hexagon", category: "geometric", description: "Regular hexagon centered at the origin", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function hexagon(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<polygon${attrs({ points: "-50,0 -25,-43 25,-43 50,0 25,43 -25,43", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
hexagon.meta = meta;
export default hexagon;
