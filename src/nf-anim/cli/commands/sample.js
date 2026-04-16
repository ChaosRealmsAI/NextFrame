import { BEHAVIORS } from "../../behaviors/index.js";
import { renderMotion } from "../../engine/render.js";
import { SCENES } from "../../scenes/index.js";
const meta = { name: "sample", kind: "cli", description: "Sample registry output" };
export default function sampleCmd(args = { _: [] }) {
  const [kind = "behavior", name] = args._;
  if (["scene", "scenes"].includes(kind) && name) {
    const scene = SCENES[name]; if (!scene) return void console.error(`Fix: unknown scene "${name}"`);
    const vp = { width: 1920, height: 1080 }, params = scene.sample(), motion = scene.render(null, 0.5, params, vp);
    const payload = { name, t: 0.5, params, describe: scene.describe(0.5, params, vp), motion, svg: renderMotion(null, 0.5, motion) };
    if (args.json) console.log(JSON.stringify(payload, null, 2)); else console.log(JSON.stringify(payload, null, 2));
    return payload;
  }
  if (!["behavior", "behaviors"].includes(kind) || !name) return void console.error('Fix: run "sample behavior <name>" or "sample scene <name>"');
  const fn = BEHAVIORS[name]; if (!fn) return void console.error(`Fix: unknown behavior "${name}"`);
  const { startAt = 0, duration = fn.meta?.default_duration || 1, ...opts } = fn.meta?.examples?.[0] || {}; const payload = { name, startAt, duration, opts, sample: fn(startAt, duration, opts) };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(JSON.stringify(payload.sample, null, 2));
  return payload;
}
export { meta };
