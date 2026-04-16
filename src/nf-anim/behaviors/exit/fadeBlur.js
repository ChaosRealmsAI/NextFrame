import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "fadeBlur",
  "exit",
  "Combined blur and slight shrink exit",
  0.7,
  [
    p("blur", "number", 14, "ending blur radius in px"),
    p("toScale", "number", 0.9, "ending scale factor as the fade finishes"),
  ],
  { blur: 14, toScale: 0.9 },
);
function fadeBlur(startAt = 0, duration = 0.7, opts = {}) {
  const blur = opts.blur ?? 14;
  const toScale = opts.toScale ?? 0.9;
  return {
    tracks: {
      opacity: [
        [startAt, 1],
        [at(startAt, duration), 0, "in"],
      ],
      blur: [
        [startAt, 0],
        [at(startAt, duration), blur, "in"],
      ],
      scale: [
        [startAt, 1],
        [at(startAt, duration), toScale, "in"],
      ],
    },
  };
}
fadeBlur.meta = meta;
export default fadeBlur;
