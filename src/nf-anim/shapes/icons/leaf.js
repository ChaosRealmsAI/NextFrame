import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for leaf if spec shifts
const meta = { name: "leaf", category: "icons", description: "Leaf icon centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function leaf(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  const vein = stroke ?? "rgba(255,255,255,0.45)";
  return `<g><path${attrs({ d: "M 0,-50 C 34,-50 52,-24 47,7 C 42,38 17,54 0,58 C -17,54 -42,38 -47,7 C -52,-24 -34,-50 0,-50 Z", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/><path${attrs({ d: "M -3,42 C 2,10 16,-11 34,-30", fill: "none", stroke: vein, "stroke-width": Math.max(strokeWidth || 0, 4), "stroke-linecap": "round" })}/></g>`;
}
leaf.meta = meta;
export default leaf;
