import glow from "./glow.js";
import shadow from "./shadow.js";
import blur from "./blur.js";
const meta = { name: "effects", kind: "shapes", description: "effect wrapper shapes registry" };
export const EFFECT_SHAPES = { glow, shadow, blur };
export function listShapes() {
  // TODO: return richer registry metadata
  return Object.values(EFFECT_SHAPES).map((entry) => entry.meta || entry);
}
export { meta };
export default EFFECT_SHAPES;
