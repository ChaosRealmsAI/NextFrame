import fadeIn from "./fadeIn.js";
import slideInLeft from "./slideInLeft.js";
import slideInRight from "./slideInRight.js";
import slideInUp from "./slideInUp.js";
import slideInDown from "./slideInDown.js";
import scaleIn from "./scaleIn.js";
import blurIn from "./blurIn.js";
import springIn from "./springIn.js";
import popIn from "./popIn.js";
import dotIn from "./dotIn.js";
import unfold from "./unfold.js";
import wipeReveal from "./wipeReveal.js";
import drawIn from "./drawIn.js";
const meta = { name: "entrance", kind: "behaviors", description: "entrance behaviors registry" };
export const ENTRANCE_BEHAVIORS = { fadeIn, slideInLeft, slideInRight, slideInUp, slideInDown, scaleIn, blurIn, springIn, popIn, dotIn, unfold, wipeReveal, drawIn };
export function listBehaviors() {
  // TODO: return richer registry metadata
  return Object.values(ENTRANCE_BEHAVIORS).map((entry) => entry.meta || entry);
}
export { meta };
export default ENTRANCE_BEHAVIORS;
