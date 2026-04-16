// TODO: implement per entrance behavior spec for unfold
const meta = { name: "unfold", category: "entrance", description: "Unfold entrance behavior stub", default_duration: 0.8, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.8, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.8 }] };
function unfold(startAt = 0, duration = 0.8, opts = {}) {
  // TODO: return semantic tracks for unfold
  return { tracks: {}, startAt, duration, opts };
}
unfold.meta = meta;
export default unfold;
