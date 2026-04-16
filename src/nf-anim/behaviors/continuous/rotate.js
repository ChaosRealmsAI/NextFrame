import { at, metaOf, p } from "../shared.js";
const meta = metaOf("rotate", "continuous", "Loop-safe quarter-turn cycle", 4, [p("angle", "number", 360, "total angular travel across the loop before returning to the start value")], { angle: 360 });
function rotate(startAt = 0, duration = 4, opts = {}) {
  const angle = opts.angle ?? 360;
  return { tracks: { rotate: [[startAt, 0], [at(startAt, duration, 0.25), angle * 0.25], [at(startAt, duration, 0.5), angle * 0.5], [at(startAt, duration, 0.75), angle * 0.75], [at(startAt, duration), 0, "linear"]] } };
}
rotate.meta = meta;
export default rotate;
