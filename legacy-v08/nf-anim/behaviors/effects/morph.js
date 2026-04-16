import { at, metaOf, p } from "../shared.js";
// TODO: expand beyond direct command-to-command interpolation when path topology support is needed.
const meta = metaOf(
  "morph",
  "effects",
  "Morph one SVG path d string into another when command sequences match",
  1.2,
  [
    p("from", "string", "M0,0L100,0L100,100Z", "starting SVG path d string"),
    p("to", "string", "M0,0L200,0L200,200Z", "target SVG path d string"),
  ],
  { from: "M0,0L100,0L100,100Z", to: "M0,0L200,0L200,200Z" },
);
function morph(startAt = 0, duration = 1.2, opts = {}) {
  const from = typeof opts.from === "string" ? opts.from : "";
  const to = typeof opts.to === "string" ? opts.to : from;
  return {
    tracks: {
      d: [
        [startAt, from],
        [at(startAt, duration), to, "inOut"],
      ],
    },
  };
}
morph.meta = meta;
export default morph;
