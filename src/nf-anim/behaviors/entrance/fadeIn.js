// TODO: implement per entrance behavior spec for fadeIn
const meta = { name: "fadeIn", category: "entrance", description: "Fade In entrance behavior stub", default_duration: 0.6, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.6, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.6 }] };
function fadeIn(startAt = 0, duration = 0.6, opts = {}) {
  // TODO: return semantic tracks for fadeIn
  return { tracks: {}, startAt, duration, opts };
}
fadeIn.meta = meta;
export default fadeIn;
