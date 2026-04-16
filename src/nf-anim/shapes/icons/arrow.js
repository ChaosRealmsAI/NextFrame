// TODO: implement normalized SVG geometry for arrow
const meta = { name: "arrow", category: "icons", description: "Arrow icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function arrow(layer = {}) {
  // TODO: return SVG string for arrow
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
arrow.meta = meta;
export default arrow;
