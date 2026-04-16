import fadeOut from "./fadeOut.js";
import slideOut from "./slideOut.js";
import scaleOut from "./scaleOut.js";
import blurOut from "./blurOut.js";
import shrinkOut from "./shrinkOut.js";
import fadeBlur from "./fadeBlur.js";
import collapse from "./collapse.js";
import dissolveOut from "./dissolveOut.js";
const meta = { name: "exit", kind: "behaviors", description: "exit behaviors registry" };
export const EXIT_BEHAVIORS = { fadeOut, slideOut, scaleOut, blurOut, shrinkOut, fadeBlur, collapse, dissolveOut };
export function listBehaviors() {
  // TODO: return richer registry metadata
  return Object.values(EXIT_BEHAVIORS).map((entry) => entry.meta || entry);
}
export { meta };
export default EXIT_BEHAVIORS;
