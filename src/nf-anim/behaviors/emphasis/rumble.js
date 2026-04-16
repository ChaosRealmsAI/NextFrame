import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "rumble",
  "emphasis",
  "Short chaotic rumble for impact",
  0.5,
  [
    p(
      "distance",
      "number",
      10,
      "maximum x/y displacement in px during the rumble",
    ),
  ],
  { distance: 10 },
);
function rumble(startAt = 0, duration = 0.5, opts = {}) {
  const distance = opts.distance ?? 10;
  return {
    tracks: {
      x: [
        [startAt, 0],
        [at(startAt, duration, 0.16), -distance],
        [at(startAt, duration, 0.32), distance],
        [at(startAt, duration, 0.48), -distance * 0.8],
        [at(startAt, duration, 0.64), distance * 0.6],
        [at(startAt, duration), 0, "inOut"],
      ],
      y: [
        [startAt, 0],
        [at(startAt, duration, 0.16), distance * 0.45],
        [at(startAt, duration, 0.32), -distance * 0.4],
        [at(startAt, duration, 0.48), distance * 0.3],
        [at(startAt, duration, 0.64), -distance * 0.2],
        [at(startAt, duration), 0, "inOut"],
      ],
    },
  };
}
rumble.meta = meta;
export default rumble;
