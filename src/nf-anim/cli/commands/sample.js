import { BEHAVIORS } from "../../behaviors/index.js";
const meta = { name: "sample", kind: "cli", description: "Sample registry output" };
export default function sampleCmd(args = { _: [] }) {
  const [kind = "behavior", name] = args._;
  if (!["behavior", "behaviors"].includes(kind) || !name) return void console.error('Fix: run "sample behavior <name>"');
  const fn = BEHAVIORS[name];
  if (!fn) return void console.error(`Fix: unknown behavior "${name}"`);
  const { startAt = 0, duration = fn.meta?.default_duration || 1, ...opts } = fn.meta?.examples?.[0] || {};
  const payload = { name, startAt, duration, opts, sample: fn(startAt, duration, opts) };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(JSON.stringify(payload.sample, null, 2));
  return payload;
}
export { meta };
