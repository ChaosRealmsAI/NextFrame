// TODO: implement normalized SVG geometry for hexagon
const meta = { name: "hexagon", category: "geometric", description: "Hexagon geometric shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function hexagon(layer = {}) {
  // TODO: return SVG string for hexagon
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
hexagon.meta = meta;
export default hexagon;
