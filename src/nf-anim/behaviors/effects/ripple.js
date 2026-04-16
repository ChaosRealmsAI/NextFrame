import { metaOf, p } from "../shared.js";
const meta = metaOf(
  "ripple",
  "effects",
  "Descriptor for engine-expanded ripple layers",
  0.9,
  [
    p(
      "color",
      "string",
      "#ff9ab8",
      "stroke or fill color used by the spawned ripple rings",
    ),
    p(
      "maxRadius",
      "number",
      200,
      "largest radius reached by the outer ripple ring in px",
    ),
  ],
  { color: "#ff9ab8", maxRadius: 200 },
);
function ripple(startAt = 0, duration = 0.9, opts = {}) {
  return {
    expand: "ripple",
    startAt,
    duration,
    color: opts.color ?? "#ff9ab8",
    maxRadius: opts.maxRadius ?? 200,
  };
}
ripple.meta = meta;
export default ripple;
