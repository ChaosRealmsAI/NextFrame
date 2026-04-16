// TODO: compose successConfetti scene layers from nf-anim behaviors and shapes
const meta = { id: "successConfetti", ratio: "any", duration_hint: 2.5, type: "motion", category: "feedback", description: "Success Confetti feedback scene stub" };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    // TODO: return motion config for successConfetti
    return { duration: 2.5, size: [vp.width || 0, vp.height || 0], layers: [] };
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
