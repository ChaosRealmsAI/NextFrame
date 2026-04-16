import { ICONS_SHAPES } from "./icons/index.js";
import { GEOMETRIC_SHAPES } from "./geometric/index.js";
import { DATA_SHAPES } from "./data/index.js";
import { TEXT_SHAPES } from "./text/index.js";
import { EFFECT_SHAPES } from "./effects/index.js";
const meta = { name: "shapes", kind: "registry", description: "nf-anim shape registry across icons, geometric, data, text, and effects" };
export const SHAPES = { ...ICONS_SHAPES, ...GEOMETRIC_SHAPES, ...DATA_SHAPES, ...TEXT_SHAPES, ...EFFECT_SHAPES };
export function listShapes() { return Object.values(SHAPES).map((entry) => entry.meta || entry); }
export { meta };
export default SHAPES;
