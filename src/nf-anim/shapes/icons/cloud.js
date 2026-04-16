import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for cloud if spec shifts
const meta = { name: "cloud", category: "icons", description: "Rounded cloud icon centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function cloud(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<path${attrs({ d: "M -44,18 C -58,18 -68,8 -68,-6 C -68,-22 -55,-34 -39,-34 C -34,-47 -22,-56 -8,-56 C 10,-56 25,-43 28,-26 C 43,-26 56,-14 56,1 C 56,16 44,28 28,28 L -44,28 Z", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
cloud.meta = meta;
export default cloud;
