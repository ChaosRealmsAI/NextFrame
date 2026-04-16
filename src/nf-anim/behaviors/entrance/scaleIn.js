// TODO: implement per entrance behavior spec for scaleIn
const meta = { name: "scaleIn", category: "entrance", description: "Scale In entrance behavior stub", default_duration: 0.6, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.6, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.6 }] };
function scaleIn(startAt = 0, duration = 0.6, opts = {}) {
  // TODO: return semantic tracks for scaleIn
  return { tracks: {}, startAt, duration, opts };
}
scaleIn.meta = meta;
export default scaleIn;
