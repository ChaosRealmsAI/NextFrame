// TODO: implement normalized SVG geometry for drop
const meta = { name: "drop", category: "icons", description: "Drop icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function drop(layer = {}) {
  // TODO: return SVG string for drop
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
drop.meta = meta;
export default drop;
