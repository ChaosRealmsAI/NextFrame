import wipeNext from "./wipeNext.js";
import dissolveCard from "./dissolveCard.js";
import irisOpen from "./irisOpen.js";
import pushReveal from "./pushReveal.js";
const meta = { name: "transition", kind: "scenes", description: "transition scenes registry" };
export const TRANSITION_SCENES = { wipeNext, dissolveCard, irisOpen, pushReveal };
export function listScenes() {
  // TODO: return richer registry metadata
  return Object.values(TRANSITION_SCENES).map((entry) => entry.meta || entry);
}
export { meta };
export default TRANSITION_SCENES;
