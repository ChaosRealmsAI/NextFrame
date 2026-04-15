// Shared domain types for the NextFrame engine.
// All modules in nf-core and nf-cli should import types from here.

import type { AnchorDict as V08AnchorDict } from "./anchors/types.js";
import type { Kind as V08Kind, Clip, Track, Track as V08Track } from "./kinds/types.js";

export type { AnchorDict, AnchorEntry, AnchorRef, ExprAst, Issue } from "./anchors/types.js";
export type { Kind, Clip, Track, KindSchema } from "./kinds/types.js";

export interface TimelineV08 {
  version: "0.8";
  anchors: V08AnchorDict;
  tracks: Array<V08Track<V08Kind>>;
  media?: Record<string, unknown>;
}

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

export interface LegacyClip {
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

export interface AudioClip extends LegacyClip {
  src?: string;
  volume?: number;
}

export interface VideoClip extends LegacyClip {
  src?: string;
}

export interface SceneClip extends LegacyClip {}

export interface SubtitleClip extends LegacyClip {
  text?: string;
  word?: Word;
}

export interface OverlayClip extends LegacyClip {}

interface BaseTrack<TKind extends string, TClip extends LegacyClip> {
  id?: string;
  kind?: TKind;
  muted?: boolean;
  clips?: TClip[];
}

export interface AudioTrack extends BaseTrack<"audio", AudioClip> {
  src?: string;
  volume?: number;
  meta?: {
    segments: Segment[];
    duration_ms: number;
  };
}

export interface VideoTrack extends BaseTrack<"video", VideoClip> {}

export interface SceneTrack extends BaseTrack<"scene", SceneClip> {}

export interface SubtitleTrack extends BaseTrack<"subtitle", SubtitleClip> {
  style?: Record<string, unknown>;
}

export interface OverlayTrack extends BaseTrack<"overlay", OverlayClip> {}

export type LegacyTrack =
  | AudioTrack
  | VideoTrack
  | SceneTrack
  | SubtitleTrack
  | OverlayTrack;

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
  layers?: LegacyClip[];
  /** v0.2 multi-track */
  tracks?: LegacyTrack[];
  _audioFingerprint?: string;
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
  text: string;
  startMs: number;
  endMs: number;
  words: Word[];
}

export interface Word {
  w: string;
  s: number;
  e: number;
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
