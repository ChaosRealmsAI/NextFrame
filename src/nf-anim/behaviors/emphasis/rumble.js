// TODO: implement per emphasis behavior spec for rumble
const meta = { name: "rumble", category: "emphasis", description: "Rumble emphasis behavior stub", default_duration: 0.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.5 }] };
function rumble(startAt = 0, duration = 0.5, opts = {}) {
  // TODO: return semantic tracks for rumble
  return { tracks: {}, startAt, duration, opts };
}
rumble.meta = meta;
export default rumble;
