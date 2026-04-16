import { at, metaOf, p } from "../shared.js";
const meta = metaOf("shake", "emphasis", "Fast horizontal attention shake", 0.6, [p("distance", "number", 18, "maximum horizontal shake distance in px")], { distance: 18 });
function shake(startAt = 0, duration = 0.6, opts = {}) {
  const distance = opts.distance ?? 18;
  return { tracks: { x: [[startAt, 0], [at(startAt, duration, 0.18), -distance], [at(startAt, duration, 0.36), distance], [at(startAt, duration, 0.54), -distance * 0.6], [at(startAt, duration, 0.72), distance * 0.35], [at(startAt, duration), 0, "inOut"]] } };
}
shake.meta = meta;
export default shake;
