// TODO: compose wipeNext scene layers from nf-anim behaviors and shapes
const meta = { id: "wipeNext", ratio: "any", duration_hint: 1.6, type: "motion", category: "transition", description: "Wipe Next transition scene stub" };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    // TODO: return motion config for wipeNext
    return { duration: 1.6, size: [vp.width || 0, vp.height || 0], layers: [] };
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
