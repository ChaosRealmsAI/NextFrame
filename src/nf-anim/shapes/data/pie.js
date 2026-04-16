// TODO: implement normalized SVG geometry for pie
const meta = { name: "pie", category: "data", description: "Pie data shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function pie(layer = {}) {
  // TODO: return SVG string for pie
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
pie.meta = meta;
export default pie;
