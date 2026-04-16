import { at, metaOf, p } from "../shared.js";
const meta = metaOf("glow", "emphasis", "Glow bloom that rises and falls", 1.5, [p("glow", "number", 1, "peak normalized glow intensity at the center of the emphasis")], { glow: 1 });
function glow(startAt = 0, duration = 1.5, opts = {}) {
  const glow = opts.glow ?? 1;
  return { tracks: { glow: [[startAt, 0], [at(startAt, duration, 0.45), glow, "out"], [at(startAt, duration), 0, "inOut"]], opacity: [[startAt, 1], [at(startAt, duration, 0.45), 1], [at(startAt, duration), 1, "out"]] } };
}
glow.meta = meta;
export default glow;
