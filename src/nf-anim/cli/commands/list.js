import { BEHAVIORS } from "../../behaviors/index.js";
import { SHAPES } from "../../shapes/index.js";
import { SCENES } from "../../scenes/index.js";
const meta = { name: "list", kind: "cli", description: "List nf-anim registries" };
const REGISTRIES = {
  behaviors: () => Object.values(BEHAVIORS).map((entry) => entry.meta || entry),
  shapes: () => Object.values(SHAPES).map((entry) => entry.meta || entry),
  scenes: () => Object.values(SCENES).map((entry) => entry.meta || entry),
};
export default function listCmd(args = { _: [] }) {
  const [kind = "behaviors"] = args._;
  const build = REGISTRIES[kind];
  if (!build) return void console.error('Fix: use "behaviors", "shapes", or "scenes" with list');
  const payload = build();
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(payload.map((entry) => entry.name || entry.id).join("\n"));
  return payload;
}
export { meta };
