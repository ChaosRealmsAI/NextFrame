import { BEHAVIORS } from "../../behaviors/index.js";
import { SCENES } from "../../scenes/index.js";
const meta = { name: "sample", kind: "cli", description: "Sample registry output" };
export default function sampleCmd(args = { _: [] }) {
  const [kind = "behavior", name] = args._;
  if (!name) return void console.error('Fix: run "sample behavior <name>" or "sample scene <name>"');
  const isScene = ["scene", "scenes"].includes(kind);
  const entry = isScene ? SCENES[name] : ["behavior", "behaviors"].includes(kind) ? BEHAVIORS[name] : null;
  if (!entry) return void console.error(`Fix: unknown ${isScene ? "scene" : "behavior"} "${name}"`);
  const payload = isScene ? { name, sample: entry.sample() } : buildBehaviorPayload(name, entry);
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(JSON.stringify(payload.sample, null, 2));
  return payload;
}
function buildBehaviorPayload(name, entry) {
  const example = entry.meta?.examples?.[0] || {};
  const { startAt = 0, duration = entry.meta?.default_duration || 1, ...opts } = example;
  return { name, startAt, duration, opts, sample: entry(startAt, duration, opts) };
}
export { meta };
