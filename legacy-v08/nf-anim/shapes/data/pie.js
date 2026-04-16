import { attrs, num } from "../shared.js";
// TODO: tune normalized SVG geometry for pie if spec shifts
const meta = {
  name: "pie",
  category: "data",
  description: "Pie wedge for a percentage value",
  params: [
    {
      name: "value",
      type: "number",
      default: 72,
      semantic: "percentage from 0 to 100",
    },
    {
      name: "radius",
      type: "number",
      default: 50,
      semantic: "pie radius in px",
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
      semantic: "optional outline color",
    },
    {
      name: "strokeWidth",
      type: "number",
      default: 0,
      semantic: "outline width in px",
    },
  ],
};
function pie(layer = {}) {
  const value = Math.max(0, Math.min(100, num(layer.value, 72)));
  const radius = Math.max(1, num(layer.radius, 50));
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  const a = (value / 100) * Math.PI * 2 - Math.PI / 2;
  const x = +(Math.cos(a) * radius).toFixed(2);
  const y = +(Math.sin(a) * radius).toFixed(2);
  const large = value > 50 ? 1 : 0;
  if (value <= 0)
    return `<path${attrs({ d: "M 0,0", fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
  if (value >= 100)
    return `<circle${attrs({ cx: 0, cy: 0, r: radius, fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
  return `<path${attrs({ d: `M 0,0 L 0,${-radius} A ${radius},${radius} 0 ${large},1 ${x},${y} Z`, fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
pie.meta = meta;
export default pie;
