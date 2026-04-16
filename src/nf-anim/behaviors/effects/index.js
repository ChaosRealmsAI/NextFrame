import impact from "./impact.js";
import ripple from "./ripple.js";
import burst from "./burst.js";
import sparkle from "./sparkle.js";
import glitch from "./glitch.js";
import morph from "./morph.js";
const meta = { name: "effects", kind: "behaviors", description: "effects behaviors registry" };
export const EFFECTS_BEHAVIORS = { impact, ripple, burst, sparkle, glitch, morph };
export function listBehaviors() { return Object.values(EFFECTS_BEHAVIORS).map((entry) => entry.meta || entry); }
export { meta };
export default EFFECTS_BEHAVIORS;
