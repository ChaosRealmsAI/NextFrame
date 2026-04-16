import { at, metaOf } from "../shared.js";
const meta = metaOf("drawIn", "entrance", "Stroke/path reveal from 0% to 100%", 0.9);
function drawIn(startAt = 0, duration = 0.9, opts = {}) {
  void opts;
  return { tracks: { strokeProgress: [[startAt, 0], [at(startAt, duration), 1, "out"]], opacity: [[startAt, 0.35], [at(startAt, duration * 0.2), 1, "out"]] } };
}
drawIn.meta = meta;
export default drawIn;
