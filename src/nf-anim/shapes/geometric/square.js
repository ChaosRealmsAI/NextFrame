// TODO: implement normalized SVG geometry for square
const meta = { name: "square", category: "geometric", description: "Square geometric shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function square(layer = {}) {
  // TODO: return SVG string for square
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
square.meta = meta;
export default square;
