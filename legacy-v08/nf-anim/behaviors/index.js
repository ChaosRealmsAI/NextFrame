import { ENTRANCE_BEHAVIORS } from "./entrance/index.js";
import { EXIT_BEHAVIORS } from "./exit/index.js";
import { EMPHASIS_BEHAVIORS } from "./emphasis/index.js";
import { CONTINUOUS_BEHAVIORS } from "./continuous/index.js";
import { DATA_BEHAVIORS } from "./data/index.js";
import { EFFECTS_BEHAVIORS } from "./effects/index.js";
const meta = { name: "behaviors", kind: "registry", description: "nf-anim behavior registry" };
export const BEHAVIORS = { ...ENTRANCE_BEHAVIORS, ...EXIT_BEHAVIORS, ...EMPHASIS_BEHAVIORS, ...CONTINUOUS_BEHAVIORS, ...DATA_BEHAVIORS, ...EFFECTS_BEHAVIORS };
export function listBehaviors() { return Object.values(BEHAVIORS).map((entry) => entry.meta || entry); }
export { meta };
export default BEHAVIORS;
