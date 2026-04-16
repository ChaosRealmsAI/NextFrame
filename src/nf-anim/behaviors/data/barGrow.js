import { at, metaOf, p } from "../shared.js";
const meta = metaOf("barGrow", "data", "Bar width growth toward a percentage", 1, [p("percent", "number", 88, "target width percentage reached by the end of the animation"), p("from", "number", 0, "starting width percentage before growth begins")], { percent: 88, from: 0 });
function barGrow(startAt = 0, duration = 1, opts = {}) {
  const percent = opts.percent ?? 88;
  const from = opts.from ?? 0;
  return { tracks: { widthPercent: [[startAt, from], [at(startAt, duration), percent, "out"]], opacity: [[startAt, 0.35], [at(startAt, duration * 0.2), 1, "out"]] } };
}
barGrow.meta = meta;
export default barGrow;
