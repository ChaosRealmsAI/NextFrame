import pulse from "./pulse.js";
import shake from "./shake.js";
import wobble from "./wobble.js";
import bounce from "./bounce.js";
import blink from "./blink.js";
import heartbeat from "./heartbeat.js";
import glow from "./glow.js";
import highlight from "./highlight.js";
import flash from "./flash.js";
import rumble from "./rumble.js";
const meta = { name: "emphasis", kind: "behaviors", description: "emphasis behaviors registry" };
export const EMPHASIS_BEHAVIORS = { pulse, shake, wobble, bounce, blink, heartbeat, glow, highlight, flash, rumble };
export function listBehaviors() { return Object.values(EMPHASIS_BEHAVIORS).map((entry) => entry.meta || entry); }
export { meta };
export default EMPHASIS_BEHAVIORS;
