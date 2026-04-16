import { at, metaOf, p } from "../shared.js";
const meta = metaOf("lineDraw", "data", "Progressive line-series reveal based on point data", 1.5, [p("data", "array", [18, 42, 35, 64], "ordered point values used to determine line complexity and reveal count")], { data: [18, 42, 35, 64] });
function lineDraw(startAt = 0, duration = 1.5, opts = {}) {
  const data = Array.isArray(opts.data) && opts.data.length ? opts.data : [18, 42, 35, 64];
  return { tracks: { pathProgress: [[startAt, 0], [at(startAt, duration), 1, "out"]], pointCount: [[startAt, 0], [at(startAt, duration), data.length, "out"]] } };
}
lineDraw.meta = meta;
export default lineDraw;
