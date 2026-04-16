import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "glitch",
  "effects",
  "Short jitter burst for digital interference",
  0.4,
  [
    p("distance", "number", 14, "maximum horizontal glitch displacement in px"),
    p(
      "rgbShift",
      "number",
      8,
      "channel separation intensity used by the renderer",
    ),
  ],
  { distance: 14, rgbShift: 8 },
);
function glitch(startAt = 0, duration = 0.4, opts = {}) {
  const distance = opts.distance ?? 14;
  const rgbShift = opts.rgbShift ?? 8;
  return {
    tracks: {
      x: [
        [startAt, 0],
        [at(startAt, duration, 0.15), -distance],
        [at(startAt, duration, 0.32), distance * 0.8],
        [at(startAt, duration, 0.48), -distance * 0.5],
        [at(startAt, duration), 0, "inOut"],
      ],
      rgbShift: [
        [startAt, 0],
        [at(startAt, duration, 0.15), rgbShift],
        [at(startAt, duration, 0.48), rgbShift * 0.4],
        [at(startAt, duration), 0, "inOut"],
      ],
      opacity: [
        [startAt, 1],
        [at(startAt, duration, 0.5), 0.92, "linear"],
        [at(startAt, duration), 1, "linear"],
      ],
    },
  };
}
glitch.meta = meta;
export default glitch;
