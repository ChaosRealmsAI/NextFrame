// TODO: implement per entrance behavior spec for blurIn
const meta = { name: "blurIn", category: "entrance", description: "Blur In entrance behavior stub", default_duration: 0.7, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.7, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.7 }] };
function blurIn(startAt = 0, duration = 0.7, opts = {}) {
  // TODO: return semantic tracks for blurIn
  return { tracks: {}, startAt, duration, opts };
}
blurIn.meta = meta;
export default blurIn;
