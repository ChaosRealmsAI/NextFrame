// TODO: implement normalized SVG geometry for bar
const meta = { name: "bar", category: "data", description: "Bar data shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function bar(layer = {}) {
  // TODO: return SVG string for bar
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
bar.meta = meta;
export default bar;
