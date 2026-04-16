import { attrs, pathD, pts, num } from "../shared.js";
// TODO: tune normalized SVG geometry for area if spec shifts
const meta = {
  name: "area",
  category: "data",
  description: "Area chart shape closed to a baseline",
  params: [
    {
      name: "points",
      type: "point[]",
      default: [
        [-50, 20],
        [-20, -10],
        [15, -4],
        [50, -30],
      ],
      semantic: "ordered list of [x,y] points",
    },
    {
      name: "baseline",
      type: "number",
      default: 44,
      semantic: "closing baseline y position",
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
function area(layer = {}) {
  const fallback = [
    [-50, 20],
    [-20, -10],
    [15, -4],
    [50, -30],
  ];
  const fill = layer.fill ?? "#da7756";
  const stroke = layer.stroke;
  const strokeWidth = layer.strokeWidth ?? 0;
  const baseline = num(layer.baseline, 44);
  const points = pts(layer.points, fallback);
  const start = points[0];
  const end = points[points.length - 1];
  return `<path${attrs({ d: `${pathD(points, fallback)} L ${end[0]},${baseline} L ${start[0]},${baseline} Z`, fill, stroke, "stroke-width": stroke ? strokeWidth : null })}/>`;
}
area.meta = meta;
export default area;
