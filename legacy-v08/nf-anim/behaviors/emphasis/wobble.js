import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "wobble",
  "emphasis",
  "Pendulum-style rotational wobble",
  1,
  [
    p("angle", "number", 12, "maximum rotation angle in degrees"),
    p(
      "shift",
      "number",
      10,
      "matching horizontal offset in px during the wobble",
    ),
  ],
  { angle: 12, shift: 10 },
);
function wobble(startAt = 0, duration = 1, opts = {}) {
  const angle = opts.angle ?? 12;
  const shift = opts.shift ?? 10;
  return {
    tracks: {
      rotate: [
        [startAt, 0],
        [at(startAt, duration, 0.2), angle],
        [at(startAt, duration, 0.45), -angle * 0.85],
        [at(startAt, duration, 0.7), angle * 0.45],
        [at(startAt, duration), 0, "inOut"],
      ],
      x: [
        [startAt, 0],
        [at(startAt, duration, 0.2), shift],
        [at(startAt, duration, 0.45), -shift],
        [at(startAt, duration, 0.7), shift * 0.5],
        [at(startAt, duration), 0, "inOut"],
      ],
    },
  };
}
wobble.meta = meta;
export default wobble;
