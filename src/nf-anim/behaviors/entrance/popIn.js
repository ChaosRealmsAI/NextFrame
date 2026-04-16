import { at, metaOf, p } from "../shared.js";
const meta = metaOf("popIn", "entrance", "Quick punchy scale entrance", 0.5, [p("fromScale", "number", 0.5, "small starting scale before the pop"), p("peakScale", "number", 1.08, "peak scale reached before settling")]);
function popIn(startAt = 0, duration = 0.5, opts = {}) {
  const fromScale = opts.fromScale ?? 0.5;
  const peakScale = opts.peakScale ?? 1.08;
  return { tracks: { opacity: [[startAt, 0], [at(startAt, duration * 0.35), 1, "out"]], scale: [[startAt, fromScale], [at(startAt, duration, 0.55), peakScale, "out"], [at(startAt, duration), 1, "inOut"]] } };
}
popIn.meta = meta;
export default popIn;
