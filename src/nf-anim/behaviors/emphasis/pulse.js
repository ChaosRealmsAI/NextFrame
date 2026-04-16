// TODO: implement per emphasis behavior spec for pulse
const meta = { name: "pulse", category: "emphasis", description: "Pulse emphasis behavior stub", default_duration: 2, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 2, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 2 }] };
function pulse(startAt = 0, duration = 2, opts = {}) {
  // TODO: return semantic tracks for pulse
  return { tracks: {}, startAt, duration, opts };
}
pulse.meta = meta;
export default pulse;
