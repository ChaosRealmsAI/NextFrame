// TODO: implement normalized SVG geometry for star
const meta = { name: "star", category: "icons", description: "Star icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function star(layer = {}) {
  // TODO: return SVG string for star
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
star.meta = meta;
export default star;
