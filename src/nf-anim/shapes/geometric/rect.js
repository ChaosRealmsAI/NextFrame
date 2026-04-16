import { attrs, num } from "../shared.js";
// TODO: tune normalized SVG geometry for rect if spec shifts
const meta = {
  name: "rect",
  category: "geometric",
  description: "Rectangle centered at the origin",
  params: [
    {
      name: "width",
      type: "number",
      default: 120,
      semantic: "rect width in px",
    },
    {
      name: "height",
      type: "number",
      default: 80,
      semantic: "rect height in px",
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
function rect(layer = {}) {
  const width = Math.max(1, num(layer.width, 120));
  const height = Math.max(1, num(layer.height, 80));
  const radius = Math.max(0, num(layer.radius, 0));
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  return `<rect${attrs({ x: -width / 2, y: -height / 2, width, height, rx: radius, ry: radius, fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
rect.meta = meta;
export default rect;
