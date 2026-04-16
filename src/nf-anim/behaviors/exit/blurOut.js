// TODO: implement per exit behavior spec for blurOut
const meta = { name: "blurOut", category: "exit", description: "Blur Out exit behavior stub", default_duration: 0.7, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.7, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.7 }] };
function blurOut(startAt = 0, duration = 0.7, opts = {}) {
  // TODO: return semantic tracks for blurOut
  return { tracks: {}, startAt, duration, opts };
}
blurOut.meta = meta;
export default blurOut;
