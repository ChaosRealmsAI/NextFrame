// TODO: implement per emphasis behavior spec for glow
const meta = { name: "glow", category: "emphasis", description: "Glow emphasis behavior stub", default_duration: 1.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1.5 }] };
function glow(startAt = 0, duration = 1.5, opts = {}) {
  // TODO: return semantic tracks for glow
  return { tracks: {}, startAt, duration, opts };
}
glow.meta = meta;
export default glow;
