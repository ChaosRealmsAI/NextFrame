// Track host — aggregates Track.render outputs into a single DOM fragment.
// Walking stub: returns an empty document fragment and collects audio refs.

export function renderTracks(state, tracks) {
  const nodes = [];
  const audio = [];
  for (const track of tracks ?? []) {
    if (typeof track.render !== "function") continue;
    const out = track.render(state.t, track.keyframes ?? [], state.viewport);
    if (out && out.dom) nodes.push(out.dom);
    if (out && out.audio) audio.push(out.audio);
  }
  return { nodes, audio };
}
