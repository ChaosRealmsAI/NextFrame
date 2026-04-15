// v0.3 timeline helpers kept outside engine/.

type LooseTimeline = Record<string, unknown>;
type LooseLayer = Record<string, unknown>;

export const V3_SCHEMA = "nextframe/v0.3";

interface TimelineTemplateOpts {
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  background?: string;
}

export function createTimelineTemplate(opts: TimelineTemplateOpts = {}) {
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

export function detectFormat(timeline: LooseTimeline) {
  if (!timeline || typeof timeline !== "object") return "unknown";
  if (Array.isArray(timeline.layers)) return timeline.schema === V3_SCHEMA ? "v0.3" : "v0.3-like";
  if (Array.isArray(timeline.tracks)) return "legacy";
  return "unknown";
}

export function timelineMetrics(timeline: LooseTimeline | null | undefined) {
  return {
    width: finiteNumber(timeline?.width, 1920),
    height: finiteNumber(timeline?.height, 1080),
    fps: finiteNumber(timeline?.fps, 30),
    duration: finiteNumber(timeline?.duration, 10),
    background: typeof timeline?.background === "string" && (timeline.background as string).trim()
      ? timeline.background as string
      : "#05050c",
  };
}

export function cloneTimeline<T>(timeline: T): T {
  return JSON.parse(JSON.stringify(timeline));
}

export function listActiveLayers(timeline: LooseTimeline, t: number) {
  const layers = Array.isArray(timeline?.layers) ? timeline.layers as LooseLayer[] : [];
  return layers
    .filter((layer) => isLayerActive(layer, t))
    .map((layer, index) => ({
    ...layer,
    localT: round3(t - (layer.start as number)),
    progress: (layer.dur as number) > 0 ? round3((t - (layer.start as number)) / (layer.dur as number)) : 0,
    order: index
  }));
}

export function isLayerActive(layer: LooseLayer | null | undefined, t: number): boolean {
  if (!layer || typeof layer !== "object") return false;
  const start = Number(layer.start);
  const dur = Number(layer.dur);
  if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return false;
  return t >= start && t < start + dur;
}

export function findLayer(timeline: LooseTimeline | null | undefined, layerId: string) {
  return ((timeline?.layers || []) as LooseLayer[]).find((layer) => layer.id === layerId) || null;
}

export function finiteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
