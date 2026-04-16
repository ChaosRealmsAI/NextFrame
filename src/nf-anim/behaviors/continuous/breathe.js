import { at, metaOf, p } from "../shared.js";
const meta = metaOf("breathe", "continuous", "Scale-and-opacity breathing loop", 3, [p("scale", "number", 0.03, "maximum scale delta above and below 1"), p("opacity", "number", 0.08, "maximum opacity delta around the resting state")], { scale: 0.03, opacity: 0.08 });
function breathe(startAt = 0, duration = 3, opts = {}) {
  const scale = opts.scale ?? 0.03;
  const opacity = opts.opacity ?? 0.08;
  return { tracks: { scale: [[startAt, 1], [at(startAt, duration, 0.25), 1 + scale], [at(startAt, duration, 0.5), 1], [at(startAt, duration, 0.75), 1 - scale], [at(startAt, duration), 1, "linear"]], opacity: [[startAt, 1], [at(startAt, duration, 0.25), 1 - opacity], [at(startAt, duration, 0.5), 1], [at(startAt, duration, 0.75), 1 - opacity * 0.5], [at(startAt, duration), 1, "linear"]] } };
}
breathe.meta = meta;
export default breathe;
