import heartLike from "./heartLike.js";
import animatedCheck from "./animatedCheck.js";
import errorShake from "./errorShake.js";
import loadingPulse from "./loadingPulse.js";
import successConfetti from "./successConfetti.js";
const meta = { name: "feedback", kind: "scenes", description: "feedback scenes registry" };
export const FEEDBACK_SCENES = { heartLike, animatedCheck, errorShake, loadingPulse, successConfetti };
export function listScenes() {
  // TODO: return richer registry metadata
  return Object.values(FEEDBACK_SCENES).map((entry) => entry.meta || entry);
}
export { meta };
export default FEEDBACK_SCENES;
