// TODO: compose dotMatrix scene layers from nf-anim behaviors and shapes
const meta = { id: "dotMatrix", ratio: "any", duration_hint: 4, type: "motion", category: "background", description: "Dot Matrix background scene stub" };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    // TODO: return motion config for dotMatrix
    return { duration: 4, size: [vp.width || 0, vp.height || 0], layers: [] };
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
