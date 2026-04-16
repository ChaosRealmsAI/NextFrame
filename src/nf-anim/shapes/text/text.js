// TODO: implement normalized SVG geometry for text
const meta = { name: "text", category: "text", description: "Text text shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function text(layer = {}) {
  // TODO: return SVG string for text
  return `<text x="0" y="0">${layer.text || "Text"}</text>`;
}
text.meta = meta;
export default text;
