import { at, metaOf, p } from "../shared.js";
const meta = metaOf("drift", "continuous", "Slow figure-eight-like drift loop", 6, [p("x", "number", 28, "maximum horizontal drift in px"), p("y", "number", 18, "maximum vertical drift in px")], { x: 28, y: 18 });
function drift(startAt = 0, duration = 6, opts = {}) {
  const x = opts.x ?? 28;
  const y = opts.y ?? 18;
  return { tracks: { x: [[startAt, 0], [at(startAt, duration, 0.25), x], [at(startAt, duration, 0.5), 0], [at(startAt, duration, 0.75), -x], [at(startAt, duration), 0, "linear"]], y: [[startAt, 0], [at(startAt, duration, 0.25), -y], [at(startAt, duration, 0.5), 0], [at(startAt, duration, 0.75), y], [at(startAt, duration), 0, "linear"]] } };
}
drift.meta = meta;
export default drift;
