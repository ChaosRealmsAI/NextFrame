import { HERO_SCENES } from "./hero/index.js";
import { DATA_SCENES } from "./data/index.js";
import { REVEAL_SCENES } from "./reveal/index.js";
import { FEEDBACK_SCENES } from "./feedback/index.js";
import { TRANSITION_SCENES } from "./transition/index.js";
import { BACKGROUND_SCENES } from "./background/index.js";
const meta = { name: "scenes", kind: "registry", description: "nf-anim scene registry" };
export const SCENES = { ...HERO_SCENES, ...DATA_SCENES, ...REVEAL_SCENES, ...FEEDBACK_SCENES, ...TRANSITION_SCENES, ...BACKGROUND_SCENES };
export function listScenes() { return Object.values(SCENES).map((entry) => ({ id: entry.id, description: entry.description })); }
export { meta };
export default SCENES;
