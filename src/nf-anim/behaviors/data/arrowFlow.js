import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "arrowFlow",
  "data",
  "Directional flow cue whose strength comes from a value",
  1,
  [
    p(
      "value",
      "number",
      100,
      "flow magnitude used to scale the arrow travel intensity",
    ),
  ],
  { value: 100 },
);
function arrowFlow(startAt = 0, duration = 1, opts = {}) {
  const value = opts.value ?? 100;
  const strength = Math.max(0.2, Math.min(1.5, Math.abs(value) / 100));
  return {
    tracks: {
      flowOffset: [
        [startAt, 1],
        [at(startAt, duration), 0, "linear"],
      ],
      opacity: [
        [startAt, 0.2],
        [at(startAt, duration * 0.15), 1, "out"],
      ],
      scaleX: [
        [startAt, 0.85],
        [at(startAt, duration), 1 + strength * 0.08, "out"],
      ],
    },
  };
}
arrowFlow.meta = meta;
export default arrowFlow;
