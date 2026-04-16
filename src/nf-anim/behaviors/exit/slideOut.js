import { at, metaOf, p } from "../shared.js";
const meta = metaOf("slideOut", "exit", "Directional slide-away with fade", 0.6, [p("distance", "number", 64, "travel distance in px during the exit"), p("direction", "number", 1, "horizontal direction multiplier where 1 slides right and -1 slides left")]);
function slideOut(startAt = 0, duration = 0.6, opts = {}) {
  const distance = opts.distance ?? 64;
  const direction = opts.direction ?? 1;
  return { tracks: { opacity: [[startAt, 1], [at(startAt, duration), 0, "in"]], x: [[startAt, 0], [at(startAt, duration), distance * direction, "in"]] } };
}
slideOut.meta = meta;
export default slideOut;
