// TODO: compose kpiGrid scene layers from nf-anim behaviors and shapes
const meta = { id: "kpiGrid", ratio: "any", duration_hint: 3, type: "motion", category: "data", description: "Kpi Grid data scene stub" };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    // TODO: return motion config for kpiGrid
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
