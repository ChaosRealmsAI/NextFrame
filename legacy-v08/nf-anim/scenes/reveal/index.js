import featureRow from "./featureRow.js";
import processFlow from "./processFlow.js";
import listStagger from "./listStagger.js";
import cardGrid from "./cardGrid.js";
import timelineFlow from "./timelineFlow.js";
import gridReveal from "./gridReveal.js";
const meta = { name: "reveal", kind: "scenes", description: "reveal scenes registry" };
export const REVEAL_SCENES = { featureRow, processFlow, listStagger, cardGrid, timelineFlow, gridReveal };
export function listScenes() {
  // TODO: return richer registry metadata
  return Object.values(REVEAL_SCENES).map((entry) => entry.meta || entry);
}
export { meta };
export default REVEAL_SCENES;
