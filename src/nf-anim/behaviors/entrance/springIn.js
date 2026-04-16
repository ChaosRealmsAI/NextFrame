import { at, metaOf, p } from "../shared.js";
const meta = metaOf("springIn", "entrance", "Elastic pop with overshoot and settle", 0.8, [p("fromScale", "number", 0.72, "compressed scale used before the spring overshoot"), p("overshoot", "number", 1.1, "peak scale reached before settling back to 1")]);
function springIn(startAt = 0, duration = 0.8, opts = {}) {
  const fromScale = opts.fromScale ?? 0.72;
  const overshoot = opts.overshoot ?? 1.1;
  return { tracks: { opacity: [[startAt, 0], [at(startAt, duration * 0.45), 1, "out"]], scale: [[startAt, fromScale], [at(startAt, duration, 0.65), overshoot, "outBack"], [at(startAt, duration), 1, "inOut"]] } };
}
springIn.meta = meta;
export default springIn;
