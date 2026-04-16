import text from "./text.js";
import splitText from "./splitText.js";
import marquee from "./marquee.js";
const meta = { name: "text", kind: "shapes", description: "text shapes registry" };
export const TEXT_SHAPES = { text, splitText, marquee };
export function listShapes() {
  // TODO: return richer registry metadata
  return Object.values(TEXT_SHAPES).map((entry) => entry.meta || entry);
}
export { meta };
export default TEXT_SHAPES;
