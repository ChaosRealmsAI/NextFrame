// TODO: compose errorShake scene layers from nf-anim behaviors and shapes
const meta = { id: "errorShake", ratio: "any", duration_hint: 2, type: "motion", category: "feedback", description: "Error Shake feedback scene stub" };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    // TODO: return motion config for errorShake
    return { duration: 2, size: [vp.width || 0, vp.height || 0], layers: [] };
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
