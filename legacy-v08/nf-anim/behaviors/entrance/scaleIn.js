import { at, metaOf, p } from "../shared.js";
const meta = metaOf("scaleIn", "entrance", "Uniform scale-up reveal", 0.6, [p("fromScale", "number", 0.6, "starting scale factor before settling to full size")]);
function scaleIn(startAt = 0, duration = 0.6, opts = {}) {
  const fromScale = opts.fromScale ?? 0.6;
  return { tracks: { opacity: [[startAt, 0], [at(startAt, duration * 0.7), 1, "out"]], scale: [[startAt, fromScale], [at(startAt, duration), 1, "out"]] } };
}
scaleIn.meta = meta;
export default scaleIn;
