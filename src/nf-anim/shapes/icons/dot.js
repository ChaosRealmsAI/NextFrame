// TODO: implement normalized SVG geometry for dot
const meta = { name: "dot", category: "icons", description: "Dot icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function dot(layer = {}) {
  // TODO: return SVG string for dot
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
dot.meta = meta;
export default dot;
