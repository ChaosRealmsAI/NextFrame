import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "sway",
  "continuous",
  "Side-to-side sway loop",
  3,
  [
    p("angle", "number", 6, "maximum sway rotation in degrees"),
    p("shift", "number", 10, "matching horizontal sway offset in px"),
  ],
  { angle: 6, shift: 10 },
);
function sway(startAt = 0, duration = 3, opts = {}) {
  const angle = opts.angle ?? 6;
  const shift = opts.shift ?? 10;
  return {
    tracks: {
      rotate: [
        [startAt, 0],
        [at(startAt, duration, 0.25), angle],
        [at(startAt, duration, 0.5), 0],
        [at(startAt, duration, 0.75), -angle],
        [at(startAt, duration), 0, "linear"],
      ],
      x: [
        [startAt, 0],
        [at(startAt, duration, 0.25), shift],
        [at(startAt, duration, 0.5), 0],
        [at(startAt, duration, 0.75), -shift],
        [at(startAt, duration), 0, "linear"],
      ],
    },
  };
}
sway.meta = meta;
export default sway;
