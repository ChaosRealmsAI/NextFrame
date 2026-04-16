import { at, metaOf, p } from "../shared.js";
const meta = metaOf("bounce", "emphasis", "Lift-and-settle bounce emphasis", 1, [p("height", "number", 22, "peak upward travel in px during the first bounce")], { height: 22 });
function bounce(startAt = 0, duration = 1, opts = {}) {
  const height = opts.height ?? 22;
  return { tracks: { y: [[startAt, 0], [at(startAt, duration, 0.25), -height], [at(startAt, duration, 0.5), 0], [at(startAt, duration, 0.72), -height * 0.38], [at(startAt, duration), 0, "inOut"]] } };
}
bounce.meta = meta;
export default bounce;
