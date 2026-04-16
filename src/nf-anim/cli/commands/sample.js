import ENGINE from "../../engine/index.js";
import { BEHAVIORS } from "../../behaviors/index.js";
import { SCENES } from "../../scenes/index.js";
const meta = { name: "sample", kind: "cli", description: "Sample behavior or scene output" };
export default function sampleCmd(args = { _: [] }) {
  const [kind = "behavior", name] = args._;
  if (["behavior", "behaviors"].includes(kind)) {
    const fn = BEHAVIORS[name];
    if (!fn) return void console.error('Fix: run "sample behavior <name>"');
    const { startAt = 0, duration = fn.meta?.default_duration || 1, ...opts } = fn.meta?.examples?.[0] || {};
    const payload = { name, startAt, duration, opts, sample: fn(startAt, duration, opts) };
    if (args.json) console.log(JSON.stringify(payload, null, 2)); else console.log(JSON.stringify(payload.sample, null, 2));
    return payload;
  }
  if (["scene", "scenes"].includes(kind)) {
    const scene = SCENES[name], vp = { width: 1920, height: 1080 };
    if (!scene) return void console.error('Fix: run "sample scene <name>"');
    const params = scene.sample?.() || {}, sample = scene.render?.(null, 0, params, vp) || null;
    const payload = { name, params, describe: scene.describe?.(0, params, vp) || null, sample, svg: sample ? ENGINE.renderMotion(vp, 0, sample) : "" };
    if (args.json) console.log(JSON.stringify(payload, null, 2)); else console.log(JSON.stringify(payload.sample, null, 2));
    return payload;
  }
  return void console.error('Fix: run "sample behavior <name>" or "sample scene <name>"');
}
export { meta };
