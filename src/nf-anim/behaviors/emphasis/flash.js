import { at, metaOf, p } from "../shared.js";
const meta = metaOf("flash", "emphasis", "Quick bright flash dip-and-return", 0.4, [p("dimOpacity", "number", 0.3, "temporary opacity dip that creates the flash beat")], { dimOpacity: 0.3 });
function flash(startAt = 0, duration = 0.4, opts = {}) {
  const dimOpacity = opts.dimOpacity ?? 0.3;
  return { tracks: { opacity: [[startAt, 1], [at(startAt, duration, 0.28), dimOpacity], [at(startAt, duration), 1, "out"]] } };
}
flash.meta = meta;
export default flash;
