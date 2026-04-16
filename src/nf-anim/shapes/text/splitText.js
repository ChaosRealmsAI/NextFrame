import { attrs, esc, num } from "../shared.js";
// TODO: tune normalized SVG geometry for splitText if spec shifts
const meta = { name: "splitText", category: "text", description: "Split text into positioned SVG text nodes", params: [{ name: "text", type: "string", default: "Split Text", semantic: "text content" }, { name: "splitBy", type: "string", default: "char", semantic: "char or word splitting" }, { name: "fontSize", type: "number", default: 40, semantic: "font size in px" }, { name: "font", type: "string", default: "system-ui, sans-serif", semantic: "font-family value" }, { name: "fill", type: "color", default: "#da7756", semantic: "text fill color" }] };
function splitText(layer = {}) {
  const value = String(layer.text ?? "Split Text"); const splitBy = layer.splitBy === "word" ? "word" : "char"; const fontSize = num(layer.fontSize, 40); const font = layer.font ?? "system-ui, sans-serif"; const fill = layer.fill ?? "#da7756";
  const tokens = splitBy === "word" ? value.trim().split(/\s+/).filter(Boolean) : Array.from(value || " "); const gap = splitBy === "word" ? fontSize * 0.35 : fontSize * 0.08;
  const widths = tokens.map((t) => Math.max(fontSize * 0.35, t.length * fontSize * (splitBy === "word" ? 0.56 : t === " " ? 0.32 : 0.62))); const total = widths.reduce((a, w) => a + w, 0) + (Math.max(tokens.length - 1, 0) * gap); let x = -total / 2;
  return `<g>${tokens.map((token, i) => { const out = `<text${attrs({ x: +(x + (widths[i] / 2)).toFixed(2), y: 0, fill, "font-size": fontSize, "font-family": font, "text-anchor": "middle", "dominant-baseline": "middle", "xml:space": "preserve" })}>${esc(token)}</text>`; x += widths[i] + gap; return out; }).join("")}</g>`;
}
splitText.meta = meta;
export default splitText;
