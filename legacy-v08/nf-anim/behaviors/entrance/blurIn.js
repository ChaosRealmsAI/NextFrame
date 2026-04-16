import { at, metaOf, p } from "../shared.js";
const meta = metaOf("blurIn", "entrance", "Blur-to-sharp entrance", 0.7, [p("blur", "number", 18, "starting blur radius in px before the image resolves")]);
function blurIn(startAt = 0, duration = 0.7, opts = {}) {
  const blur = opts.blur ?? 18;
  return { tracks: { opacity: [[startAt, 0], [at(startAt, duration), 1, "out"]], blur: [[startAt, blur], [at(startAt, duration), 0, "out"]] } };
}
blurIn.meta = meta;
export default blurIn;
