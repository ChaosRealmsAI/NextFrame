import { BEHAVIORS } from "../../behaviors/index.js";
import { SHAPES } from "../../shapes/index.js";
import { SCENES } from "../../scenes/index.js";
const meta = { name: "list", kind: "cli", description: "List nf-anim registries stub" };
const SOURCES = { behaviors: BEHAVIORS, shapes: SHAPES, scenes: SCENES };
export default function listCmd(args = { _: [] }) {
  // TODO: list and print real registry data
  const key = args._[0] || "shapes";
  const source = SOURCES[key];
  if (!source) return void console.error('Fix: use "behaviors", "shapes", or "scenes" with list');
  const list = Object.values(source).map((entry) => entry.meta || entry);
  if (args.json) console.log(JSON.stringify(list, null, 2));
  else list.forEach((entry) => console.log(entry.name || entry.id || "(unnamed)"));
  return list;
}
export { meta };
