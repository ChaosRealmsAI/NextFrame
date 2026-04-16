// TODO: implement normalized SVG geometry for bell
const meta = { name: "bell", category: "icons", description: "Bell icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function bell(layer = {}) {
  // TODO: return SVG string for bell
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
bell.meta = meta;
export default bell;
