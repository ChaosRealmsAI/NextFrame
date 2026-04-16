// TODO: implement per entrance behavior spec for springIn
const meta = { name: "springIn", category: "entrance", description: "Spring In entrance behavior stub", default_duration: 0.8, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.8, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.8 }] };
function springIn(startAt = 0, duration = 0.8, opts = {}) {
  // TODO: return semantic tracks for springIn
  return { tracks: {}, startAt, duration, opts };
}
springIn.meta = meta;
export default springIn;
