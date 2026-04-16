import meshGradient from "./meshGradient.js";
import dotMatrix from "./dotMatrix.js";
const meta = { name: "background", kind: "scenes", description: "background scenes registry" };
export const BACKGROUND_SCENES = { meshGradient, dotMatrix };
export function listScenes() {
  // TODO: return richer registry metadata
  return Object.values(BACKGROUND_SCENES).map((entry) => entry.meta || entry);
}
export { meta };
export default BACKGROUND_SCENES;
