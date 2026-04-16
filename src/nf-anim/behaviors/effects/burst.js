import { metaOf, p } from "../shared.js";
const meta = metaOf("burst", "effects", "Descriptor for engine-expanded burst particles", 0.6, [p("color", "string", "#ffd166", "particle color used by the burst"), p("count", "number", 12, "number of spawned burst particles"), p("distance", "number", 120, "furthest particle travel distance in px from the origin")], { color: "#ffd166", count: 12, distance: 120 });
function burst(startAt = 0, duration = 0.6, opts = {}) {
  return { expand: "burst", startAt, duration, color: opts.color ?? "#ffd166", count: opts.count ?? 12, distance: opts.distance ?? 120 };
}
burst.meta = meta;
export default burst;
