import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "impact",
  "effects",
  "Heavy hit with squash and settle",
  1.5,
  [
    p("scale", "number", 1.18, "peak impact scale before settling"),
    p(
      "stretch",
      "number",
      0.12,
      "temporary vertical squash applied during impact",
    ),
  ],
  { scale: 1.18, stretch: 0.12 },
);
function impact(startAt = 0, duration = 1.5, opts = {}) {
  const scale = opts.scale ?? 1.18;
  const stretch = opts.stretch ?? 0.12;
  return {
    tracks: {
      opacity: [
        [startAt, 0],
        [at(startAt, duration * 0.14), 1, "out"],
      ],
      scale: [
        [startAt, 0.7],
        [at(startAt, duration, 0.18), scale, "outBack"],
        [at(startAt, duration, 0.42), 1 - stretch, "inOut"],
        [at(startAt, duration), 1, "inOut"],
      ],
    },
  };
}
impact.meta = meta;
export default impact;
