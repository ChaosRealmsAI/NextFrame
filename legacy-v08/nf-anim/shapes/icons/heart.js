import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for heart if spec shifts
const meta = {
  name: "heart",
  category: "icons",
  description: "Filled heart icon centered in a 100x100 box",
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
function heart(layer = {}) {
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  const d = [
    "M 0,-15 C 0,-40 -30,-55 -55,-45",
    "C -85,-30 -90,10 -60,35 C -30,55 -5,65 0,75",
    "C 5,65 30,55 60,35 C 90,10 85,-30 55,-45",
    "C 30,-55 0,-40 0,-15 Z",
  ].join(" ");
  return `<path${attrs({
    d,
    fill,
    stroke,
    "stroke-width": stroke ? strokeWidth : null,
  })}/>`;
}
heart.meta = meta;
export default heart;
