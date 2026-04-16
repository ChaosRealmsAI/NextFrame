import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for arrow if spec shifts
const meta = { name: "arrow", category: "icons", description: "Right-arrow icon centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function arrow(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<path${attrs({ d: "M -50,-12 L 8,-12 L 8,-34 L 50,0 L 8,34 L 8,12 L -50,12 Z", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
arrow.meta = meta;
export default arrow;
