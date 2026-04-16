import { attrs, pointsAttr } from "../shared.js";
// TODO: tune normalized SVG geometry for polygon if spec shifts
const meta = {
  name: "polygon",
  category: "geometric",
  description: "Custom polygon from layer.points",
  params: [
    {
      name: "points",
      type: "point[]",
      default: [
        [0, -50],
        [48, -16],
        [30, 40],
        [-30, 40],
        [-48, -16],
      ],
      semantic: "ordered list of [x,y] points",
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
function polygon(layer = {}) {
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  const fallback = [
    [0, -50],
    [48, -16],
    [30, 40],
    [-30, 40],
    [-48, -16],
  ];
  return `<polygon${attrs({ points: pointsAttr(layer.points, fallback), fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
polygon.meta = meta;
export default polygon;
