import rotate from "./rotate.js";
import drift from "./drift.js";
import breathe from "./breathe.js";
import float from "./float.js";
import orbit from "./orbit.js";
import sway from "./sway.js";
const meta = { name: "continuous", kind: "behaviors", description: "continuous behaviors registry" };
export const CONTINUOUS_BEHAVIORS = { rotate, drift, breathe, float, orbit, sway };
export function listBehaviors() {
  // TODO: return richer registry metadata
  return Object.values(CONTINUOUS_BEHAVIORS).map((entry) => entry.meta || entry);
}
export { meta };
export default CONTINUOUS_BEHAVIORS;
