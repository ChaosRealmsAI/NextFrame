import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for star if spec shifts
const meta = { name: "star", category: "icons", description: "Five-point star centered in a 100x100 box", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill or gradient ref" }, { name: "stroke", type: "color", default: null, semantic: "optional stroke color" }, { name: "strokeWidth", type: "number", default: 0, semantic: "stroke width in px" }] };
function star(layer = {}) {
  const fill = layer.fill ?? "#da7756"; const stroke = layer.stroke; const strokeWidth = layer.strokeWidth ?? 0;
  return `<polygon${attrs({ points: "0,-50 14,-15 48,-15 21,6 31,40 0,21 -31,40 -21,6 -48,-15 -14,-15", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
star.meta = meta;
export default star;
