import { getScene } from "./scenes.js";
import { listActiveLayers } from "./timeline.js";

export function describeAt(timeline, t) {
  const active = listActiveLayers(timeline, t).map((layer) => {
    const meta = getScene(layer.scene);
    return {
      id: layer.id,
      scene: layer.scene,
      localT: layer.localT,
      progress: layer.progress,
      params: layer.params || {},
      x: layer.x ?? null,
      y: layer.y ?? null,
      w: layer.w ?? null,
      h: layer.h ?? null,
      zIndex: layer.zIndex ?? null,
      category: meta?.category || null,
      type: meta?.type || null,
    };
  });

  return {
    ok: true,
    value: {
      t,
      active,
      activeCount: active.length,
    },
  };
}
