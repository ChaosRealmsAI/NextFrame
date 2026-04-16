// TODO: compose cardGrid scene layers from nf-anim behaviors and shapes
const meta = { id: "cardGrid", ratio: "any", duration_hint: 3, type: "motion", category: "reveal", description: "Card Grid reveal scene stub" };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    // TODO: return motion config for cardGrid
    return { duration: 3, size: [vp.width || 0, vp.height || 0], layers: [] };
  },
  describe(t, params = {}, vp = {}) {
    // TODO: expose AI-facing description contract
    return { sceneId: meta.id, t, params, vp };
  },
  sample() {
    // TODO: return ready-to-preview params
    return {};
  },
};
