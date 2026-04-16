import countUp from "./countUp.js";
import barGrow from "./barGrow.js";
import lineDraw from "./lineDraw.js";
import nodeReveal from "./nodeReveal.js";
import arrowFlow from "./arrowFlow.js";
import mapPin from "./mapPin.js";
import pieFill from "./pieFill.js";
import chartReveal from "./chartReveal.js";
const meta = { name: "data", kind: "behaviors", description: "data behaviors registry" };
export const DATA_BEHAVIORS = { countUp, barGrow, lineDraw, nodeReveal, arrowFlow, mapPin, pieFill, chartReveal };
export function listBehaviors() { return Object.values(DATA_BEHAVIORS).map((entry) => entry.meta || entry); }
export { meta };
export default DATA_BEHAVIORS;
