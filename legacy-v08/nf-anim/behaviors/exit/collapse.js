import { at, metaOf, p } from "../shared.js";
const meta = metaOf("collapse", "exit", "Vertical fold-down exit", 0.6, [p("toScaleY", "number", 0, "ending vertical scale when the collapse completes")], { toScaleY: 0 });
function collapse(startAt = 0, duration = 0.6, opts = {}) {
  const toScaleY = opts.toScaleY ?? 0;
  return { tracks: { opacity: [[startAt, 1], [at(startAt, duration), 0, "in"]], scaleY: [[startAt, 1], [at(startAt, duration), toScaleY, "in"]] } };
}
collapse.meta = meta;
export default collapse;
