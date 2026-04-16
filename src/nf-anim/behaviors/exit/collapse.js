// TODO: implement per exit behavior spec for collapse
const meta = { name: "collapse", category: "exit", description: "Collapse exit behavior stub", default_duration: 0.6, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.6, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.6 }] };
function collapse(startAt = 0, duration = 0.6, opts = {}) {
  // TODO: return semantic tracks for collapse
  return { tracks: {}, startAt, duration, opts };
}
collapse.meta = meta;
export default collapse;
