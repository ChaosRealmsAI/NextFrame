import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "dotIn",
  "entrance",
  "Tiny-point expansion into full size",
  0.4,
  [
    p("fromScale", "number", 0.14, "initial dot-like scale before expansion"),
    p("blur", "number", 6, "soft blur applied at the first frame"),
  ],
);
function dotIn(startAt = 0, duration = 0.4, opts = {}) {
  const fromScale = opts.fromScale ?? 0.14;
  const blur = opts.blur ?? 6;
  return {
    tracks: {
      opacity: [
        [startAt, 0],
        [at(startAt, duration * 0.4), 1, "out"],
      ],
      scale: [
        [startAt, fromScale],
        [at(startAt, duration), 1, "out"],
      ],
      blur: [
        [startAt, blur],
        [at(startAt, duration), 0, "out"],
      ],
    },
  };
}
dotIn.meta = meta;
export default dotIn;
