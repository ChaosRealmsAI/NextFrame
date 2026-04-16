// TODO: implement normalized SVG geometry for plus
const meta = { name: "plus", category: "icons", description: "Plus icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function plus(layer = {}) {
  // TODO: return SVG string for plus
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
plus.meta = meta;
export default plus;
