import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "orbit",
  "continuous",
  "Circular orbit loop around an anchor point",
  5,
  [p("radius", "number", 24, "orbit radius in px from the anchor point")],
  { radius: 24 },
);
function orbit(startAt = 0, duration = 5, opts = {}) {
  const radius = opts.radius ?? 24;
  return {
    tracks: {
      x: [
        [startAt, 0],
        [at(startAt, duration, 0.25), radius],
        [at(startAt, duration, 0.5), 0],
        [at(startAt, duration, 0.75), -radius],
        [at(startAt, duration), 0, "linear"],
      ],
      y: [
        [startAt, -radius],
        [at(startAt, duration, 0.25), 0],
        [at(startAt, duration, 0.5), radius],
        [at(startAt, duration, 0.75), 0],
        [at(startAt, duration), -radius, "linear"],
      ],
    },
  };
}
orbit.meta = meta;
export default orbit;
