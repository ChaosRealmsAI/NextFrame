import { at, metaOf, p } from "../shared.js";
const meta = metaOf("blurOut", "exit", "Sharp-to-blurred fade out", 0.7, [p("blur", "number", 18, "ending blur radius in px when the element leaves")], { blur: 18 });
function blurOut(startAt = 0, duration = 0.7, opts = {}) {
  const blur = opts.blur ?? 18;
  return { tracks: { opacity: [[startAt, 1], [at(startAt, duration), 0, "in"]], blur: [[startAt, 0], [at(startAt, duration), blur, "in"]] } };
}
blurOut.meta = meta;
export default blurOut;
