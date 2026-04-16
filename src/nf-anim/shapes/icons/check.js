// TODO: implement normalized SVG geometry for check
const meta = { name: "check", category: "icons", description: "Check icons shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function check(layer = {}) {
  // TODO: return SVG string for check
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
check.meta = meta;
export default check;
