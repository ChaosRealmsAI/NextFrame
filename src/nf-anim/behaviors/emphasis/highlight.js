import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "highlight",
  "emphasis",
  "Subtle lift plus highlight bloom",
  1,
  [
    p("glow", "number", 0.8, "peak glow intensity during the highlight"),
    p("lift", "number", -8, "vertical lift in px at the highlight peak"),
  ],
  { glow: 0.8, lift: -8 },
);
function highlight(startAt = 0, duration = 1, opts = {}) {
  const glow = opts.glow ?? 0.8;
  const lift = opts.lift ?? -8;
  return {
    tracks: {
      glow: [
        [startAt, 0],
        [at(startAt, duration, 0.45), glow, "out"],
        [at(startAt, duration), 0, "inOut"],
      ],
      y: [
        [startAt, 0],
        [at(startAt, duration, 0.45), lift, "out"],
        [at(startAt, duration), 0, "inOut"],
      ],
    },
  };
}
highlight.meta = meta;
export default highlight;
