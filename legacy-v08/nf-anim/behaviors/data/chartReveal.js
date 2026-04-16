import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "chartReveal",
  "data",
  "Axes then series reveal driven by dataset length",
  1.6,
  [
    p(
      "data",
      "array",
      [12, 26, 18, 34, 41],
      "ordered values used to determine chart complexity and reveal count",
    ),
  ],
  { data: [12, 26, 18, 34, 41] },
);
function chartReveal(startAt = 0, duration = 1.6, opts = {}) {
  const data =
    Array.isArray(opts.data) && opts.data.length
      ? opts.data
      : [12, 26, 18, 34, 41];
  return {
    tracks: {
      axisOpacity: [
        [startAt, 0],
        [at(startAt, duration, 0.25), 1, "out"],
      ],
      pathProgress: [
        [startAt, 0],
        [at(startAt, duration), 1, "out"],
      ],
      pointCount: [
        [startAt, 0],
        [at(startAt, duration), data.length, "out"],
      ],
    },
  };
}
chartReveal.meta = meta;
export default chartReveal;
