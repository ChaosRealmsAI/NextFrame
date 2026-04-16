import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for bolt if spec shifts
const meta = { name: "bolt", category: "icons", description: "Lightning bolt icon centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function bolt(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<path${attrs({ d: "M -8,-50 L -42,6 L -8,6 L -20,50 L 42,-10 L 6,-10 L 18,-50 Z", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
bolt.meta = meta;
export default bolt;
