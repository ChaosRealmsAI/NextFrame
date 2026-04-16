import { at, metaOf, p } from "../shared.js";
const meta = metaOf("slideInUp", "entrance", "Bottom-to-center slide with fade", 0.7, [p("distance", "number", 48, "vertical offset in px below the final position")]);
function slideInUp(startAt = 0, duration = 0.7, opts = {}) {
  const distance = opts.distance ?? 48;
  return { tracks: { opacity: [[startAt, 0], [at(startAt, duration), 1, "out"]], y: [[startAt, distance], [at(startAt, duration), 0, "out"]] } };
}
slideInUp.meta = meta;
export default slideInUp;
