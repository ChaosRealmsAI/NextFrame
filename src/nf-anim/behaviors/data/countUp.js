import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "countUp",
  "data",
  "Animated numeric count toward a target value",
  1.5,
  [
    p("value", "number", 1247, "target number reached by the end of the count"),
    p("from", "number", 0, "starting number before counting begins"),
  ],
  { value: 1247, from: 0 },
);
function countUp(startAt = 0, duration = 1.5, opts = {}) {
  const value = opts.value ?? 1247;
  const from = opts.from ?? 0;
  return {
    tracks: {
      number: [
        [startAt, from],
        [at(startAt, duration), value, "out"],
      ],
      opacity: [
        [startAt, 0.4],
        [at(startAt, duration * 0.15), 1, "out"],
      ],
    },
  };
}
countUp.meta = meta;
export default countUp;
