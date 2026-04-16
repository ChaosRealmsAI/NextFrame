// TODO: implement per effects behavior spec for glitch
const meta = { name: "glitch", category: "effects", description: "Glitch effects behavior stub", default_duration: 0.4, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.4, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.4 }] };
function glitch(startAt = 0, duration = 0.4, opts = {}) {
  // TODO: return semantic tracks for glitch
  return { tracks: {}, startAt, duration, opts };
}
glitch.meta = meta;
export default glitch;
