import heart from "./heart.js";
import star from "./star.js";
import sparkle from "./sparkle.js";
import arrow from "./arrow.js";
import check from "./check.js";
import cross from "./cross.js";
import plus from "./plus.js";
import bolt from "./bolt.js";
import drop from "./drop.js";
import cloud from "./cloud.js";
import leaf from "./leaf.js";
import flame from "./flame.js";
import bell from "./bell.js";
import dot from "./dot.js";
import eye from "./eye.js";
const meta = { name: "icons", kind: "shapes", description: "icons shapes registry" };
export const ICONS_SHAPES = { heart, star, sparkle, arrow, check, cross, plus, bolt, drop, cloud, leaf, flame, bell, dot, eye };
export function listShapes() {
  // TODO: return richer registry metadata
  return Object.values(ICONS_SHAPES).map((entry) => entry.meta || entry);
}
export { meta };
export default ICONS_SHAPES;
