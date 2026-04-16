import { at, metaOf, p } from "../shared.js";
const meta = metaOf(
  "blink",
  "emphasis",
  "Rapid opacity blink for attention",
  0.8,
  [
    p(
      "minOpacity",
      "number",
      0.15,
      "lowest opacity reached during each blink dip",
    ),
  ],
  { minOpacity: 0.15 },
);
function blink(startAt = 0, duration = 0.8, opts = {}) {
  const minOpacity = opts.minOpacity ?? 0.15;
  return {
    tracks: {
      opacity: [
        [startAt, 1],
        [at(startAt, duration, 0.2), minOpacity],
        [at(startAt, duration, 0.35), 1],
        [at(startAt, duration, 0.55), minOpacity],
        [at(startAt, duration), 1, "out"],
      ],
    },
  };
}
blink.meta = meta;
export default blink;
