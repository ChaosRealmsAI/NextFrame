import { attrs } from "../shared.js";
// TODO: tune normalized SVG geometry for bell if spec shifts
const meta = {
  name: "bell",
  category: "icons",
  description: "Bell icon centered in a 100x100 box",
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
function bell(layer = {}) {
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  const outline = [
    "M 0,-52 C 20,-52 36,-36 36,-8",
    "L 36,20 C 36,31 42,40 50,46",
    "L -50,46 C -42,40 -36,31 -36,20",
    "L -36,-8 C -36,-36 -20,-52 0,-52 Z",
  ].join(" ");
  return `<g><path${attrs({
    d: outline,
    fill,
    stroke,
    "stroke-width": stroke ? strokeWidth : null,
  })}/><circle${attrs({ cx: 0, cy: 57, r: 8, fill: stroke ?? fill })}/></g>`;
}
bell.meta = meta;
export default bell;
