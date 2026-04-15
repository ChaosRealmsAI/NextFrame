// v0.3 layer-based frame description helpers.

export function describeAt(timeline: any, t: any) {
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
