import { BEHAVIORS } from "../../behaviors/index.js";
import { SCENES } from "../../scenes/index.js";
import { renderMotion } from "../../engine/render.js";
const meta = { name: "sample", kind: "cli", description: "Sample registry output" };
export default function sampleCmd(args = { _: [] }) {
  const [kind = "behavior", name] = args._;
  if (!name) return void console.error('Fix: run "sample behavior <name>" or "sample scene <name>"');
  let payload;
  if (["behavior", "behaviors"].includes(kind)) {
    const fn = BEHAVIORS[name];
    if (!fn) return void console.error(`Fix: unknown behavior "${name}"`);
    const { startAt = 0, duration = fn.meta?.default_duration || 1, ...opts } = fn.meta?.examples?.[0] || {};
    payload = { name, startAt, duration, opts, sample: fn(startAt, duration, opts) };
  } else if (["scene", "scenes"].includes(kind)) {
    const scene = SCENES[name];
    if (!scene) return void console.error(`Fix: unknown scene "${name}"`);
    const params = scene.sample();
    const sample = scene.render(null, 0, params, { width: 1280, height: 720 });
    renderMotion(null, 0, sample);
    payload = { name, params, sample };
  } else return void console.error('Fix: use "behavior" or "scene" with sample');
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(JSON.stringify(payload.sample, null, 2));
  return payload;
}
export { meta };
