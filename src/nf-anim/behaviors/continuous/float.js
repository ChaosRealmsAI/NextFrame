import { at, metaOf, p } from "../shared.js";
const meta = metaOf("float", "continuous", "Soft hover loop with tiny tilt", 4, [p("y", "number", 16, "maximum vertical float offset in px"), p("tilt", "number", 2, "maximum rotation in degrees during the float cycle")], { y: 16, tilt: 2 });
function float(startAt = 0, duration = 4, opts = {}) {
  const y = opts.y ?? 16;
  const tilt = opts.tilt ?? 2;
  return { tracks: { y: [[startAt, 0], [at(startAt, duration, 0.25), -y], [at(startAt, duration, 0.5), 0], [at(startAt, duration, 0.75), y * 0.35], [at(startAt, duration), 0, "linear"]], rotate: [[startAt, 0], [at(startAt, duration, 0.25), tilt], [at(startAt, duration, 0.5), 0], [at(startAt, duration, 0.75), -tilt], [at(startAt, duration), 0, "linear"]] } };
}
float.meta = meta;
export default float;
