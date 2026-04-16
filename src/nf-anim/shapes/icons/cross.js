import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for cross if spec shifts
const meta = {
  name: "cross",
  category: "icons",
  description: "Filled cross icon centered in a 100x100 box",
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
function cross(layer = {}) {
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  const points = "-42,-28 -28,-42 0,-14 28,-42 42,-28 14,0 42,28 28,42 0,14 -28,42 -42,28 -14,0";
  return `<polygon${attrs({
    points,
    fill,
    stroke,
    "stroke-width": stroke ? strokeWidth : null,
  })}/>`;
}
cross.meta = meta;
export default cross;
