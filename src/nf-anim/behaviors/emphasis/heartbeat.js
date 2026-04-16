import { at, metaOf, p } from "../shared.js";
const meta = metaOf("heartbeat", "emphasis", "Double-beat scale throb", 1.2, [p("beatScale", "number", 1.16, "largest scale reached on the second beat")], { beatScale: 1.16 });
function heartbeat(startAt = 0, duration = 1.2, opts = {}) {
  const beatScale = opts.beatScale ?? 1.16;
  return { tracks: { scale: [[startAt, 1], [at(startAt, duration, 0.2), beatScale * 0.92], [at(startAt, duration, 0.34), 1], [at(startAt, duration, 0.52), beatScale], [at(startAt, duration), 1, "inOut"]] } };
}
heartbeat.meta = meta;
export default heartbeat;
