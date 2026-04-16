// TODO: implement per entrance behavior spec for slideInLeft
const meta = { name: "slideInLeft", category: "entrance", description: "Slide In Left entrance behavior stub", default_duration: 0.7, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.7, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.7 }] };
function slideInLeft(startAt = 0, duration = 0.7, opts = {}) {
  // TODO: return semantic tracks for slideInLeft
  return { tracks: {}, startAt, duration, opts };
}
slideInLeft.meta = meta;
export default slideInLeft;
