// TODO: implement normalized SVG geometry for rect
const meta = { name: "rect", category: "geometric", description: "Rect geometric shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function rect(layer = {}) {
  // TODO: return SVG string for rect
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
rect.meta = meta;
export default rect;
