import { at, metaOf, p } from "../shared.js";
const meta = metaOf("pulse", "emphasis", "Single expand-contract emphasis pulse", 2, [p("scale", "number", 1.08, "peak scale reached at the center of the pulse"), p("floorOpacity", "number", 0.9, "minimum opacity at the pulse peak for a softer look")], { scale: 1.08, floorOpacity: 0.9 });
function pulse(startAt = 0, duration = 2, opts = {}) {
  const scale = opts.scale ?? 1.08;
  const floorOpacity = opts.floorOpacity ?? 0.9;
  return { tracks: { scale: [[startAt, 1], [at(startAt, duration, 0.5), scale, "out"], [at(startAt, duration), 1, "inOut"]], opacity: [[startAt, 1], [at(startAt, duration, 0.5), floorOpacity, "out"], [at(startAt, duration), 1, "inOut"]] } };
}
pulse.meta = meta;
export default pulse;
