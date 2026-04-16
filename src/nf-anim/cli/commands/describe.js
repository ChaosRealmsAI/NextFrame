import { BEHAVIORS } from "../../behaviors/index.js";
import { SHAPES } from "../../shapes/index.js";
import { SCENES } from "../../scenes/index.js";
const meta = { name: "describe", kind: "cli", description: "Describe component metadata" };
const REGISTRIES = { behavior: BEHAVIORS, behaviors: BEHAVIORS, shape: SHAPES, shapes: SHAPES, scene: SCENES, scenes: SCENES };
export default function describeCmd(args = { _: [] }) {
  const [kind = "behavior", name] = args._;
  const entry = REGISTRIES[kind]?.[name];
  if (!entry) return void console.error(`Fix: describe needs a valid ${kind} name`);
  const payload = entry.meta || entry;
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(JSON.stringify(payload, null, 2));
  return payload;
}
export { meta };
