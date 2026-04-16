// TODO: implement per exit behavior spec for fadeOut
const meta = { name: "fadeOut", category: "exit", description: "Fade Out exit behavior stub", default_duration: 0.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.5 }] };
function fadeOut(startAt = 0, duration = 0.5, opts = {}) {
  // TODO: return semantic tracks for fadeOut
  return { tracks: {}, startAt, duration, opts };
}
fadeOut.meta = meta;
export default fadeOut;
