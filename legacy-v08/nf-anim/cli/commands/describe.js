import { describeEntry } from "../../catalog.js";
const meta = { name: "describe", kind: "cli", description: "Describe component metadata" };
export default function describeCmd(args = { _: [] }) {
  // TODO: support fuzzy lookup aliases if the registry grows large enough to need it.
  const kind = ({ behavior: "behavior", behaviors: "behavior", shape: "shape", shapes: "shape", scene: "scene", scenes: "scene" })[args._[0] || "behavior"];
  const payload = describeEntry(kind, args._[1]);
  if (!payload) return void (process.exitCode = 1, console.error(`Fix: describe needs a valid ${args._[0] || "behavior"} name`));
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}
export { meta };
