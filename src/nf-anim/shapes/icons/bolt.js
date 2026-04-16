// TODO: implement normalized SVG geometry for bolt
const meta = { name: "bolt", category: "icons", description: "Bolt icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function bolt(layer = {}) {
  // TODO: return SVG string for bolt
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
bolt.meta = meta;
export default bolt;
