// TODO: implement per entrance behavior spec for slideInDown
const meta = { name: "slideInDown", category: "entrance", description: "Slide In Down entrance behavior stub", default_duration: 0.7, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.7, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.7 }] };
function slideInDown(startAt = 0, duration = 0.7, opts = {}) {
  // TODO: return semantic tracks for slideInDown
  return { tracks: {}, startAt, duration, opts };
}
slideInDown.meta = meta;
export default slideInDown;
