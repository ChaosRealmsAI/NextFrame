// TODO: implement normalized SVG geometry for leaf
const meta = { name: "leaf", category: "icons", description: "Leaf icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function leaf(layer = {}) {
  // TODO: return SVG string for leaf
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
leaf.meta = meta;
export default leaf;
