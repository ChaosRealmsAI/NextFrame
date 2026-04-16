// TODO: implement normalized SVG geometry for triangle
const meta = { name: "triangle", category: "geometric", description: "Triangle geometric shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function triangle(layer = {}) {
  // TODO: return SVG string for triangle
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
triangle.meta = meta;
export default triangle;
