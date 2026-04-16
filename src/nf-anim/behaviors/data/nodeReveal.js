import { at, metaOf, p } from "../shared.js";
const meta = metaOf("nodeReveal", "data", "Node-by-node network reveal based on data length", 1.2, [p("data", "array", [1, 2, 3, 4], "array whose length determines how many nodes become visible")], { data: [1, 2, 3, 4] });
function nodeReveal(startAt = 0, duration = 1.2, opts = {}) {
  const data = Array.isArray(opts.data) && opts.data.length ? opts.data : [1, 2, 3, 4];
  return { tracks: { revealCount: [[startAt, 0], [at(startAt, duration), data.length, "out"]], scale: [[startAt, 0.85], [at(startAt, duration), 1, "out"]] } };
}
nodeReveal.meta = meta;
export default nodeReveal;
