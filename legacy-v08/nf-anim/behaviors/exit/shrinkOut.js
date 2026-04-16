import { at, metaOf, p } from "../shared.js";
const meta = metaOf("shrinkOut", "exit", "Horizontal squeeze toward the center", 0.5, [p("toScaleX", "number", 0, "ending horizontal scale once the squeeze completes")], { toScaleX: 0 });
function shrinkOut(startAt = 0, duration = 0.5, opts = {}) {
  const toScaleX = opts.toScaleX ?? 0;
  return { tracks: { opacity: [[startAt, 1], [at(startAt, duration), 0, "in"]], scaleX: [[startAt, 1], [at(startAt, duration), toScaleX, "in"]] } };
}
shrinkOut.meta = meta;
export default shrinkOut;
