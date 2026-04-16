import { at, metaOf } from "../shared.js";
const meta = metaOf("wipeReveal", "entrance", "Left-to-right clip reveal", 0.8);
function wipeReveal(startAt = 0, duration = 0.8, opts = {}) {
  void opts;
  return { tracks: { clipRight: [[startAt, 100], [at(startAt, duration), 0, "out"]], opacity: [[startAt, 1], [at(startAt, duration), 1, "out"]] } };
}
wipeReveal.meta = meta;
export default wipeReveal;
