// TODO: implement per data behavior spec for nodeReveal
const meta = { name: "nodeReveal", category: "data", description: "Node Reveal data behavior stub", default_duration: 1.2, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1.2, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1.2 }] };
function nodeReveal(startAt = 0, duration = 1.2, opts = {}) {
  // TODO: return semantic tracks for nodeReveal
  return { tracks: {}, startAt, duration, opts };
}
nodeReveal.meta = meta;
export default nodeReveal;
