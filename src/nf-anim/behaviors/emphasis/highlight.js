// TODO: implement per emphasis behavior spec for highlight
const meta = { name: "highlight", category: "emphasis", description: "Highlight emphasis behavior stub", default_duration: 1, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1 }] };
function highlight(startAt = 0, duration = 1, opts = {}) {
  // TODO: return semantic tracks for highlight
  return { tracks: {}, startAt, duration, opts };
}
highlight.meta = meta;
export default highlight;
