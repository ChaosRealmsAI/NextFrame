// TODO: implement normalized SVG geometry for marquee
const meta = { name: "marquee", category: "text", description: "Marquee text shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function marquee(layer = {}) {
  // TODO: return SVG string for marquee
  return `<text x="0" y="0">${layer.text || "Marquee"}</text>`;
}
marquee.meta = meta;
export default marquee;
