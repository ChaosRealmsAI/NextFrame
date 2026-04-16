import { attrs, num } from "../shared.js";
// TODO: tune normalized SVG geometry for ring if spec shifts
const meta = {
  name: "ring",
  category: "geometric",
  description: "Stroke-only ring centered at the origin",
  params: [
    {
      name: "radius",
      type: "number",
      default: 44,
      semantic: "ring radius in px",
    },
    {
      name: "stroke",
      type: "color",
      default: "#da7756",
      semantic: "ring stroke color",
    },
    {
      name: "strokeWidth",
      type: "number",
      default: 12,
      semantic: "stroke width in px",
    },
  ],
};
function ring(layer = {}) {
  const radius = Math.max(1, num(layer.radius, 44));
  const stroke = layer.stroke ?? layer.fill ?? "#da7756";
  const strokeWidth = Math.max(1, num(layer.strokeWidth, 12));
  return `<circle${attrs({ cx: 0, cy: 0, r: radius, fill: "none", stroke, "stroke-width": strokeWidth, "vector-effect": "non-scaling-stroke" })}/>`;
}
ring.meta = meta;
export default ring;
