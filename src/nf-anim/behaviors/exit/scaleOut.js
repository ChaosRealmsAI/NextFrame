import { at, metaOf, p } from "../shared.js";
const meta = metaOf("scaleOut", "exit", "Uniform shrink with fade", 0.5, [p("toScale", "number", 0.7, "ending scale factor when the exit completes")], { toScale: 0.7 });
function scaleOut(startAt = 0, duration = 0.5, opts = {}) {
  const toScale = opts.toScale ?? 0.7;
  return { tracks: { opacity: [[startAt, 1], [at(startAt, duration), 0, "in"]], scale: [[startAt, 1], [at(startAt, duration), toScale, "in"]] } };
}
scaleOut.meta = meta;
export default scaleOut;
