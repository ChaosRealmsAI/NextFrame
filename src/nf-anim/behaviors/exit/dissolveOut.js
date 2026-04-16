import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "dissolveOut",
  "exit",
  "Soft dissolve with blur and drift",
  0.8,
  [
    p(
      "blur",
      "number",
      10,
      "ending blur radius in px as the dissolve completes",
    ),
    p("driftY", "number", -18, "vertical drift in px during the dissolve"),
  ],
  { blur: 10, driftY: -18 },
);
function dissolveOut(startAt = 0, duration = 0.8, opts = {}) {
  const blur = opts.blur ?? 10;
  const driftY = opts.driftY ?? -18;
  return {
    tracks: {
      opacity: [
        [startAt, 1],
        [at(startAt, duration * 0.75), 0.25, "in"],
        [at(startAt, duration), 0, "in"],
      ],
      blur: [
        [startAt, 0],
        [at(startAt, duration), blur, "in"],
      ],
      y: [
        [startAt, 0],
        [at(startAt, duration), driftY, "in"],
      ],
    },
  };
}
dissolveOut.meta = meta;
export default dissolveOut;
