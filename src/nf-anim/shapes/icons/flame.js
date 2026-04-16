// TODO: implement normalized SVG geometry for flame
const meta = { name: "flame", category: "icons", description: "Flame icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function flame(layer = {}) {
  // TODO: return SVG string for flame
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
flame.meta = meta;
export default flame;
