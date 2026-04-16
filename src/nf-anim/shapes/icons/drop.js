import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for drop if spec shifts
const meta = {
  name: "drop",
  category: "icons",
  description: "Water drop icon centered in a 100x100 box",
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
function drop(layer = {}) {
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  return `<path${attrs({ d: "M 0,-55 C 22,-24 38,-3 38,18 C 38,44 21,58 0,58 C -21,58 -38,44 -38,18 C -38,-3 -22,-24 0,-55 Z", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
drop.meta = meta;
export default drop;
