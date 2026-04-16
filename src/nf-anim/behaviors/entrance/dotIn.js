// TODO: implement per entrance behavior spec for dotIn
const meta = { name: "dotIn", category: "entrance", description: "Dot In entrance behavior stub", default_duration: 0.4, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.4, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.4 }] };
function dotIn(startAt = 0, duration = 0.4, opts = {}) {
  // TODO: return semantic tracks for dotIn
  return { tracks: {}, startAt, duration, opts };
}
dotIn.meta = meta;
export default dotIn;
