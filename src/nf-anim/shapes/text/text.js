import { attrs, esc, num } from "../shared.js";
import { interp } from "../../engine/interp.js";
// TODO: tune normalized SVG geometry for text if spec shifts
const meta = { name: "text", category: "text", description: "Centered SVG text primitive", params: [{ name: "text", type: "string", default: "Text", semantic: "text content" }, { name: "fontSize", type: "number", default: 48, semantic: "font size in px" }, { name: "font", type: "string", default: "system-ui, sans-serif", semantic: "font-family value" }, { name: "fill", type: "color", default: "#da7756", semantic: "text fill color" }] };
function text(layer = {}) {
  const n = layer.tracks && interp(layer.tracks.number, num(layer.t, 0));
  const d = Number.isFinite(layer.decimals) ? layer.decimals : 0;
  const v = Number.isFinite(n) ? `${layer.prefix ?? ""}${Number(n).toFixed(d).replace(/\.0+$/, "")}${layer.suffix ?? ""}` : (layer.text ?? "Text");
  const fontSize = num(layer.fontSize, 48); const font = layer.font ?? "system-ui, sans-serif"; const fill = layer.fill ?? "#da7756";
  return `<text${attrs({ x: 0, y: 0, fill, "font-size": fontSize, "font-family": font, "font-weight": layer.weight, "font-style": layer.style, "letter-spacing": layer.letterSpacing, "text-anchor": "middle", "dominant-baseline": "middle", "xml:space": "preserve" })}>${esc(v)}</text>`;
}
text.meta = meta;
export default text;
