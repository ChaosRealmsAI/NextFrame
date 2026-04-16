// TODO: implement per entrance behavior spec for slideInRight
const meta = { name: "slideInRight", category: "entrance", description: "Slide In Right entrance behavior stub", default_duration: 0.7, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.7, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.7 }] };
function slideInRight(startAt = 0, duration = 0.7, opts = {}) {
  // TODO: return semantic tracks for slideInRight
  return { tracks: {}, startAt, duration, opts };
}
slideInRight.meta = meta;
export default slideInRight;
