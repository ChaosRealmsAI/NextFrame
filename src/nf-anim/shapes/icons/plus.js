import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for plus if spec shifts
const meta = {
  name: "plus",
  category: "icons",
  description: "Filled plus icon centered in a 100x100 box",
  params: [
    {
      name: "fill",
      type: "color",
      default: "#da7756",
      semantic: "fill or gradient ref",
    },
    {
      name: "stroke",
      type: "color",
      default: null,
      semantic: "optional stroke color",
    },
    {
      name: "strokeWidth",
      type: "number",
      default: 0,
      semantic: "stroke width in px",
    },
  ],
};
function plus(layer = {}) {
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  const points = "-14,-50 14,-50 14,-14 50,-14 50,14 14,14 14,50 -14,50 -14,14 -50,14 -50,-14 -14,-14";
  return `<polygon${attrs({
    points,
    fill,
    stroke,
    "stroke-width": stroke ? strokeWidth : null,
  })}/>`;
}
plus.meta = meta;
export default plus;
