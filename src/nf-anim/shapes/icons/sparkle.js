import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for sparkle if spec shifts
const meta = { name: "sparkle", category: "icons", description: "Eight-point sparkle icon centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function sparkle(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<path${attrs({ d: "M 0,-50 L 9,-9 L 50,0 L 9,9 L 0,50 L -9,9 L -50,0 L -9,-9 Z", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
sparkle.meta = meta;
export default sparkle;
