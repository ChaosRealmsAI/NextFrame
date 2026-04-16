// TODO: implement normalized SVG geometry for splitText
const meta = { name: "splitText", category: "text", description: "Split Text text shape stub", params: [{ name: "fill", type: "color", default: "#da7756", semantic: "fill color" }] };
function splitText(layer = {}) {
  // TODO: return SVG string for splitText
  return `<text x="0" y="0">${layer.text || "Split Text"}</text>`;
}
splitText.meta = meta;
export default splitText;
