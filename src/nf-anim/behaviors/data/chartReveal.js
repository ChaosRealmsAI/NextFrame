// TODO: implement per data behavior spec for chartReveal
const meta = { name: "chartReveal", category: "data", description: "Chart Reveal data behavior stub", default_duration: 1.6, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1.6, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1.6 }] };
function chartReveal(startAt = 0, duration = 1.6, opts = {}) {
  // TODO: return semantic tracks for chartReveal
  return { tracks: {}, startAt, duration, opts };
}
chartReveal.meta = meta;
export default chartReveal;
