import { at, metaOf, p } from "../shared.js";
const meta = metaOf("sparkle", "effects", "Short starburst twinkle", 0.8, [p("angle", "number", 90, "total rotational sweep in degrees during the sparkle"), p("glow", "number", 1, "peak glow intensity reached during the sparkle")], { angle: 90, glow: 1 });
function sparkle(startAt = 0, duration = 0.8, opts = {}) {
  const angle = opts.angle ?? 90;
  const glow = opts.glow ?? 1;
  return { tracks: { opacity: [[startAt, 0], [at(startAt, duration, 0.18), 1, "out"], [at(startAt, duration), 0, "in"]], scale: [[startAt, 0.2], [at(startAt, duration, 0.22), 1.08, "out"], [at(startAt, duration), 0.35, "in"]], rotate: [[startAt, 0], [at(startAt, duration), angle, "linear"]], glow: [[startAt, 0], [at(startAt, duration, 0.22), glow, "out"], [at(startAt, duration), 0, "in"]] } };
}
sparkle.meta = meta;
export default sparkle;
