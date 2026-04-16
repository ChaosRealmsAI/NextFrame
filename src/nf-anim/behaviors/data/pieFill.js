import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "pieFill",
  "data",
  "Pie/ring sweep toward a target percentage",
  1.2,
  [
    p(
      "percent",
      "number",
      72,
      "target pie coverage percentage reached by the end of the sweep",
    ),
  ],
  { percent: 72 },
);
function pieFill(startAt = 0, duration = 1.2, opts = {}) {
  const percent = opts.percent ?? 72;
  return {
    tracks: {
      angle: [
        [startAt, 0],
        [at(startAt, duration), percent * 3.6, "out"],
      ],
      opacity: [
        [startAt, 0.35],
        [at(startAt, duration * 0.18), 1, "out"],
      ],
    },
  };
}
pieFill.meta = meta;
export default pieFill;
