import { interp } from "./interp.js";
import { EASE } from "./easings.js";
import { stagger, loop, yoyo } from "./scheduler.js";
import { renderMotion } from "./render.js";
import { expandLayer } from "./expand.js";
const meta = { name: "engine", kind: "engine", description: "nf-anim engine registry" };
const ENGINE = { interp, EASE, stagger, loop, yoyo, renderMotion, expandLayer };
export { meta };
export default ENGINE;
