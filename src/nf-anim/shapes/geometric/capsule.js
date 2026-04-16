// TODO: implement normalized SVG geometry for capsule
const meta = { name: "capsule", category: "geometric", description: "Capsule geometric shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function capsule(layer = {}) {
  // TODO: return SVG string for capsule
  return `<path d="" fill="${layer.fill || "#da7756"}" />`;
}
capsule.meta = meta;
export default capsule;
