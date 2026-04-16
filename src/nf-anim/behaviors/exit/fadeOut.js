import { at, metaOf, p } from "../shared.js";
const meta = metaOf("fadeOut", "exit", "Linear opacity 1→0 exit", 0.5, [p("to", "number", 0, "ending opacity after the fade completes")], { to: 0 });
function fadeOut(startAt = 0, duration = 0.5, opts = {}) {
  const to = opts.to ?? 0;
  return { tracks: { opacity: [[startAt, 1], [at(startAt, duration), to, "in"]] } };
}
fadeOut.meta = meta;
export default fadeOut;
