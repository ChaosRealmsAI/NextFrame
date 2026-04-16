import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for flame if spec shifts
const meta = { name: "flame", category: "icons", description: "Flame icon centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function flame(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<path${attrs({ d: "M 10,-54 C 22,-34 10,-21 21,-6 C 34,9 38,22 35,35 C 31,53 16,64 0,64 C -22,64 -38,47 -38,24 C -38,2 -26,-12 -12,-27 C -1,-39 4,-47 10,-54 Z M 0,-10 C -10,5 -16,15 -16,26 C -16,37 -9,45 0,45 C 10,45 17,37 17,26 C 17,14 10,5 0,-10 Z", fill, stroke, "stroke-width": stroke ? strokeWidth : null, "fill-rule": "evenodd" })}/>`;
}
flame.meta = meta;
export default flame;
