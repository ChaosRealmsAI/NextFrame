// TODO: implement per effects behavior spec for impact
const meta = { name: "impact", category: "effects", description: "Impact effects behavior stub", default_duration: 1.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1.5 }] };
function impact(startAt = 0, duration = 1.5, opts = {}) {
  // TODO: return semantic tracks for impact
  return { tracks: {}, startAt, duration, opts };
}
impact.meta = meta;
export default impact;
