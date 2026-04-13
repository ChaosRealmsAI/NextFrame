// engine-v2/describe.js — describe what is active at a given time t.

export function describeAt(timeline, t) {
  const active = [];
  for (const layer of timeline.layers || []) {
    const end = layer.start + layer.dur;
    if (t >= layer.start && t < end) {
      const localT = t - layer.start;
      active.push({
        id: layer.id,
        scene: layer.scene,
        localT: Math.round(localT * 1000) / 1000,
        progress: Math.round((localT / layer.dur) * 1000) / 1000,
        params: layer.params || {},
      });
    }
  }
  return { ok: true, value: { time: t, active, count: active.length } };
}
