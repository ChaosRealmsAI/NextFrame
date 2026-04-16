// TODO: implement per exit behavior spec for scaleOut
const meta = { name: "scaleOut", category: "exit", description: "Scale Out exit behavior stub", default_duration: 0.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.5 }] };
function scaleOut(startAt = 0, duration = 0.5, opts = {}) {
  // TODO: return semantic tracks for scaleOut
  return { tracks: {}, startAt, duration, opts };
}
scaleOut.meta = meta;
export default scaleOut;
