import { at, metaOf, p } from "../shared.js";
const meta = metaOf("unfold", "entrance", "Vertical unfold from the top edge", 0.8, [p("fromScaleY", "number", 0.05, "starting vertical scale before the panel unfolds")]);
function unfold(startAt = 0, duration = 0.8, opts = {}) {
  const fromScaleY = opts.fromScaleY ?? 0.05;
  return { tracks: { opacity: [[startAt, 0], [at(startAt, duration * 0.5), 1, "out"]], scaleY: [[startAt, fromScaleY], [at(startAt, duration), 1, "out"]] } };
}
unfold.meta = meta;
export default unfold;
