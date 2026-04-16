// TODO: implement per entrance behavior spec for popIn
const meta = { name: "popIn", category: "entrance", description: "Pop In entrance behavior stub", default_duration: 0.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.5 }] };
function popIn(startAt = 0, duration = 0.5, opts = {}) {
  // TODO: return semantic tracks for popIn
  return { tracks: {}, startAt, duration, opts };
}
popIn.meta = meta;
export default popIn;
