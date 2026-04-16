// TODO: implement normalized SVG geometry for polygon
const meta = { name: "polygon", category: "geometric", description: "Polygon geometric shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function polygon(layer = {}) {
  // TODO: return SVG string for polygon
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
polygon.meta = meta;
export default polygon;
