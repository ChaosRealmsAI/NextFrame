import { at, metaOf, p } from "../shared.js";
const meta = metaOf("slideInLeft", "entrance", "Left-to-center slide with fade", 0.7, [p("distance", "number", 60, "left offset in px before the slide settles")]);
function slideInLeft(startAt = 0, duration = 0.7, opts = {}) {
  const distance = opts.distance ?? 60;
  return { tracks: { opacity: [[startAt, 0], [at(startAt, duration), 1, "out"]], x: [[startAt, -distance], [at(startAt, duration), 0, "out"]] } };
}
slideInLeft.meta = meta;
export default slideInLeft;
