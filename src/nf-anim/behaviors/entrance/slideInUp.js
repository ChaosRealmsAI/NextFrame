// TODO: implement per entrance behavior spec for slideInUp
const meta = { name: "slideInUp", category: "entrance", description: "Slide In Up entrance behavior stub", default_duration: 0.7, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.7, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.7 }] };
function slideInUp(startAt = 0, duration = 0.7, opts = {}) {
  // TODO: return semantic tracks for slideInUp
  return { tracks: {}, startAt, duration, opts };
}
slideInUp.meta = meta;
export default slideInUp;
