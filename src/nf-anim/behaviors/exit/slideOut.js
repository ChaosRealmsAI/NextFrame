// TODO: implement per exit behavior spec for slideOut
const meta = { name: "slideOut", category: "exit", description: "Slide Out exit behavior stub", default_duration: 0.6, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.6, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.6 }] };
function slideOut(startAt = 0, duration = 0.6, opts = {}) {
  // TODO: return semantic tracks for slideOut
  return { tracks: {}, startAt, duration, opts };
}
slideOut.meta = meta;
export default slideOut;
