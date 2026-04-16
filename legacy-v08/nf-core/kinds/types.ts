import type { AnchorRef, Issue } from "../anchors/types.js";

export type Kind = "audio" | "scene" | "subtitle" | "animation";

export interface Clip<K extends Kind = Kind> {
  id?: string;
  kind?: K;
  begin?: AnchorRef;
  end?: AnchorRef;
  at?: AnchorRef;
  [key: string]: unknown;
}

export interface Track<K extends Kind = Kind> {
  id?: string;
  kind: K;
  clips: Array<Clip<K>>;
  params?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export type KindValidationResult =
  | { ok: true }
  | { ok: false; issues: Issue[] };

export interface KindSchema {
  kind: Kind;
  clipFields: string[];
  trackFields: string[];
  validateClip(clip: Clip<Kind>): KindValidationResult;
  validateTrack(track: Track<Kind>): KindValidationResult;
}
