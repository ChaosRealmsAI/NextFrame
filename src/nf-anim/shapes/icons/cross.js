// TODO: implement normalized SVG geometry for cross
const meta = { name: "cross", category: "icons", description: "Cross icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function cross(layer = {}) {
  // TODO: return SVG string for cross
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
cross.meta = meta;
export default cross;
