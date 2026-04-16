import { attrs, num } from "../shared.js";
// TODO: tune normalized SVG geometry for square if spec shifts
const meta = {
  name: "square",
  category: "geometric",
  description: "Square centered at the origin",
  params: [
    {
      name: "size",
      type: "number",
      default: 100,
      semantic: "edge length in px",
    },
    {
      name: "radius",
      type: "number",
      default: 0,
      semantic: "corner radius in px",
    },
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
function square(layer = {}) {
  const size = Math.max(1, num(layer.size, 100));
  const radius = Math.max(0, num(layer.radius, 0));
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  return `<rect${attrs({ x: -size / 2, y: -size / 2, width: size, height: size, rx: radius, ry: radius, fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
square.meta = meta;
export default square;
