// TODO: implement per effects behavior spec for sparkle
const meta = { name: "sparkle", category: "effects", description: "Sparkle effects behavior stub", default_duration: 0.8, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.8, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.8 }] };
function sparkle(startAt = 0, duration = 0.8, opts = {}) {
  // TODO: return semantic tracks for sparkle
  return { tracks: {}, startAt, duration, opts };
}
sparkle.meta = meta;
export default sparkle;
