// TODO: implement normalized SVG geometry for eye
const meta = { name: "eye", category: "icons", description: "Eye icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function eye(layer = {}) {
  // TODO: return SVG string for eye
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
eye.meta = meta;
export default eye;
