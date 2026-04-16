// TODO: implement normalized SVG geometry for cloud
const meta = { name: "cloud", category: "icons", description: "Cloud icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function cloud(layer = {}) {
  // TODO: return SVG string for cloud
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
cloud.meta = meta;
export default cloud;
