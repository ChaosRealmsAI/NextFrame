// TODO: implement per exit behavior spec for dissolveOut
const meta = { name: "dissolveOut", category: "exit", description: "Dissolve Out exit behavior stub", default_duration: 0.8, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.8, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.8 }] };
function dissolveOut(startAt = 0, duration = 0.8, opts = {}) {
  // TODO: return semantic tracks for dissolveOut
  return { tracks: {}, startAt, duration, opts };
}
dissolveOut.meta = meta;
export default dissolveOut;
