import { sampleFor } from "../../catalog.js";
const meta = { name: "sample", kind: "cli", description: "Sample registry output" };
export default function sampleCmd(args = { _: [] }) {
  // TODO: emit multiple sample variants per item when the recipes need richer coverage.
  const kind = ({ behavior: "behavior", behaviors: "behavior", shape: "shape", shapes: "shape", scene: "scene", scenes: "scene" })[args._[0] || "behavior"];
  const payload = sampleFor(kind, args._[1]);
  if (!payload) return void (process.exitCode = 1, console.error('Fix: run "sample behavior|shape|scene <name>"'));
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}
export { meta };
