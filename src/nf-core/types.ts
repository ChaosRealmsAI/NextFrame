// Shared domain types for the NextFrame engine.
// All modules in nf-core and nf-cli should import types from here.

export interface Asset {
  id: string;
  path: string;
  type?: string;
}

export interface EffectConfig {
  type: string;
  dur?: number;
  [key: string]: unknown;
}

export interface FilterConfig {
  type: string;
  intensity?: number;
  [key: string]: unknown;
}

export interface TransitionConfig {
  type: string;
  dur?: number;
  [key: string]: unknown;
}

export interface ClipEffects {
  enter?: EffectConfig;
  exit?: EffectConfig;
}

export interface Clip {
  id?: string;
  scene: string;
  start: number;
  dur: number;
  params?: Record<string, unknown>;
  blend?: string;
  effects?: ClipEffects;
  filters?: FilterConfig[];
  transition?: TransitionConfig;
  muted?: boolean;
  trackId?: string;
  [key: string]: unknown;
}

export interface Track {
  id?: string;
  kind?: string;
  muted?: boolean;
  clips?: Clip[];
}

export interface Chapter {
  id?: string;
  start: number;
  end?: number;
  title?: string;
}

export interface Marker {
  id?: string;
  t: number;
  label?: string;
}

/** Raw or resolved timeline. */
export interface Timeline {
  version?: string;
  schema?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  ratio?: string;
  background?: string;
  audio?: string | {
    src?: string;
    sentences?: Array<Record<string, unknown>>;
    segments?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  _audioSrc?: string;
  /** v0.1 flat layer list */
  layers?: Clip[];
  /** v0.2 multi-track */
  tracks?: Track[];
  assets?: Asset[];
  chapters?: Chapter[];
  markers?: Marker[];
  project?: {
    width?: number;
    height?: number;
    fps?: number;
  };
}

export interface Project {
  name: string;
  width?: number;
  height?: number;
  fps?: number;
  createdAt?: string;
}

export interface Episode {
  name: string;
  project?: string;
  createdAt?: string;
}

export interface Segment {
  id: string;
  text?: string;
  start?: number;
  end?: number;
  duration?: number;
  language?: string;
  model?: string;
  previousTranscript?: string;
  audio?: string;
  video?: string;
  cn?: string[];
  /** Parsed subtitle entries */
  words?: Array<{ word: string; start: number; end: number }>;
}

export type BridgeResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export type BridgeResultV<T = unknown> = BridgeResult<T> & {
  errors?: Array<{ code: string; message: string; ref?: string; hint?: string }>;
  warnings?: Array<{ code: string; message: string; ref?: string; hint?: string }>;
  hints?: Array<{ code: string; message: string; ref?: string; hint?: string }>;
};

/** Scene entry as returned by the scene registry. */
export interface SceneEntry {
  id: string;
  description?: string;
  category?: string;
  params?: SceneParam[];
  render?: (t: number, params: Record<string, unknown>, ctx: CanvasRenderingContext2D, globalT?: number) => void;
  describe?: (params: Record<string, unknown>, clip?: unknown, localT?: number) => Record<string, unknown>;
  /** Legacy scene metadata object used by old-style scene modules */
  META?: {
    id?: string;
    label?: string;
    category?: string;
    ratio?: string;
    tech?: string;
    description?: string;
    duration_hint?: number;
    loopable?: boolean;
    tags?: string[];
    themes?: Record<string, unknown>;
    ai?: { when?: string; avoid?: string };
    params?: Record<string, SceneParam>;
    defaults?: Record<string, unknown>;
  };
}

export interface SceneParam {
  name: string;
  type: string;
  default?: unknown;
  range?: [number, number];
  required?: boolean;
  semantic?: string;
  label?: string;
}
