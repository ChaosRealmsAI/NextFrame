import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for check if spec shifts
const meta = { name: "check", category: "icons", description: "Filled check mark centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function check(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<path${attrs({ d: "M -48,1 L -28,-20 L -6,2 L 31,-38 L 48,-22 L -8,40 Z", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
check.meta = meta;
export default check;
