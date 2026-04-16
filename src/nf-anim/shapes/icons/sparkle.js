// TODO: implement normalized SVG geometry for sparkle
const meta = { name: "sparkle", category: "icons", description: "Sparkle icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function sparkle(layer = {}) {
  // TODO: return SVG string for sparkle
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
sparkle.meta = meta;
export default sparkle;
