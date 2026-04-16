// v0.3 layer-based frame description helpers.

interface LooseLayer { id: string; scene: string; start: number; dur: number; params?: Record<string, unknown> }

export function describeAt(timeline: Record<string, unknown>, t: number) {
  const active: Array<{ id: string; scene: string; localT: number; progress: number; params: Record<string, unknown> }> = [];
  for (const layer of (timeline.layers || []) as LooseLayer[]) {
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
  return { ok: true as const, value: { time: t, active, count: active.length } };
}
