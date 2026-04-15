// v0.3 timeline helpers kept outside engine/.

export const V3_SCHEMA = "nextframe/v0.3";

export function createTimelineTemplate(opts = {}) {
  const width = finiteNumber(opts.width, 1920);
  const height = finiteNumber(opts.height, 1080);

  return {
    version: "0.3",
    schema: V3_SCHEMA,
    width,
    height,
    fps: finiteNumber(opts.fps, 30),
    duration: finiteNumber(opts.duration, 10),
    background: typeof opts.background === "string" && opts.background.trim() ? opts.background : "#05050c",
    layers: [],
    chapters: [],
    markers: [],
    assets: [],
  };
}

export function detectFormat(timeline: any) {
  if (!timeline || typeof timeline !== "object") return "unknown";
  if (Array.isArray(timeline.layers)) return timeline.schema === V3_SCHEMA ? "v0.3" : "v0.3-like";
  if (Array.isArray(timeline.tracks)) return "legacy";
  return "unknown";
}

export function timelineMetrics(timeline: any) {
  return {
    width: finiteNumber(timeline?.width, 1920),
    height: finiteNumber(timeline?.height, 1080),
    fps: finiteNumber(timeline?.fps, 30),
    duration: finiteNumber(timeline?.duration, 10),
    background: typeof timeline?.background === "string" && timeline.background.trim()
      ? timeline.background
      : "#05050c",
  };
}

export function cloneTimeline(timeline: any) {
  return JSON.parse(JSON.stringify(timeline));
}

export function listActiveLayers(timeline: any, t: any) {
  const layers = Array.isArray(timeline?.layers) ? timeline.layers : [];
  return layers
    .filter((layer: any) => isLayerActive(layer, t))
    .map((layer, index) => ({
    ...layer,
    localT: round3(t - layer.start),
    progress: layer.dur > 0 ? round3((t - layer.start) / layer.dur) : 0,
    order: index
  }));
}

export function isLayerActive(layer: any, t: any) {
  if (!layer || typeof layer !== "object") return false;
  const start = Number(layer.start);
  const dur = Number(layer.dur);
  if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return false;
  return t >= start && t < start + dur;
}

export function findLayer(timeline: any, layerId: any) {
  return (timeline?.layers || []).find((layer: any) => layer.id === layerId) || null;
}

export function finiteNumber(value: any, fallback: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round3(value: any) {
  return Math.round(value * 1000) / 1000;
}
