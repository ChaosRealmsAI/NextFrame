import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for eye if spec shifts
const meta = { name: "eye", category: "icons", description: "Eye icon centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "iris fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional outline color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "outline width in px" }] };
function eye(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke ?? fill; const strokeWidth = layer.strokeWidth ?? 6;
  return `<g><path${attrs({ d: "M -56,0 C -38,-24 -21,-36 0,-36 C 21,-36 38,-24 56,0 C 38,24 21,36 0,36 C -21,36 -38,24 -56,0 Z", fill: "none", stroke, "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round" })}/><circle${attrs({ cx: 0, cy: 0, r: 14, fill })}/></g>`;
}
eye.meta = meta;
export default eye;
