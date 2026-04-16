// TODO: implement normalized SVG geometry for heart
const meta = { name: "heart", category: "icons", description: "Heart icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function heart(layer = {}) {
  // TODO: return SVG string for heart
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
heart.meta = meta;
export default heart;
