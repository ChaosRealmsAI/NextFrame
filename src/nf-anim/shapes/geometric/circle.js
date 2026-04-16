// TODO: implement normalized SVG geometry for circle
const meta = { name: "circle", category: "geometric", description: "Circle geometric shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function circle(layer = {}) {
  // TODO: return SVG string for circle
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
circle.meta = meta;
export default circle;
