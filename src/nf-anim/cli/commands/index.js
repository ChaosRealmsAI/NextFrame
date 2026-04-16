import list from "./list.js";
import describe from "./describe.js";
import preview from "./preview.js";
import sample from "./sample.js";
import suggest from "./suggest.js";
const meta = { name: "commands", kind: "cli", description: "nf-anim CLI command registry" };
export const COMMANDS = { list, describe, preview, sample, suggest };
export { meta };
export default COMMANDS;
