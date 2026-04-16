import { at, metaOf, p } from "../shared.js";
const meta = metaOf("fadeIn", "entrance", "Linear opacity 0→1 entrance", 0.6, [p("from", "number", 0, "starting opacity before reveal")]);
function fadeIn(startAt = 0, duration = 0.6, opts = {}) {
  const from = opts.from ?? 0;
  return { tracks: { opacity: [[startAt, from], [at(startAt, duration), 1, "out"]] } };
}
fadeIn.meta = meta;
export default fadeIn;
