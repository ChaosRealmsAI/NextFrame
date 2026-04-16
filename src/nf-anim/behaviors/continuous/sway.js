// TODO: implement per continuous behavior spec for sway
const meta = { name: "sway", category: "continuous", description: "Sway continuous behavior stub", default_duration: 3, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 3, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 3 }] };
function sway(startAt = 0, duration = 3, opts = {}) {
  // TODO: return semantic tracks for sway
  return { tracks: {}, startAt, duration, opts };
}
sway.meta = meta;
export default sway;
