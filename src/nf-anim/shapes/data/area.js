// TODO: implement normalized SVG geometry for area
const meta = { name: "area", category: "data", description: "Area data shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function area(layer = {}) {
  // TODO: return SVG string for area
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
area.meta = meta;
export default area;
