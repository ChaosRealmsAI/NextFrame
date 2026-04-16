// TODO: implement per exit behavior spec for fadeBlur
const meta = { name: "fadeBlur", category: "exit", description: "Fade Blur exit behavior stub", default_duration: 0.7, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.7, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.7 }] };
function fadeBlur(startAt = 0, duration = 0.7, opts = {}) {
  // TODO: return semantic tracks for fadeBlur
  return { tracks: {}, startAt, duration, opts };
}
fadeBlur.meta = meta;
export default fadeBlur;
