import { listCatalog } from "../../catalog.js";
const meta = { name: "list", kind: "cli", description: "List nf-anim registries" };
export default function listCmd(args = { _: [] }) {
  // TODO: add richer grouped table output if humans need more detail than ids.
  const kind = ({ behavior: "behavior", behaviors: "behavior", shape: "shape", shapes: "shape", scene: "scene", scenes: "scene", "": "" })[args._[0] || ""];
  if (kind === undefined) return void (process.exitCode = 1, console.error('Fix: use "behaviors", "shapes", or "scenes" with list'));
  const payload = listCatalog(kind, args.category || "");
  if (args.json || !kind) return void console.log(JSON.stringify(payload, null, 2));
  console.log(payload.map((entry) => `${entry.id || entry.name} [${entry.category}] ${entry.description}`).join("\n"));
  return payload;
}
export { meta };
