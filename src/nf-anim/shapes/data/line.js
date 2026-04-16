// TODO: implement normalized SVG geometry for line
const meta = { name: "line", category: "data", description: "Line data shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function line(layer = {}) {
  // TODO: return SVG string for line
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
line.meta = meta;
export default line;
