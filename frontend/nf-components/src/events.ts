export type TabId = "script" | "slice" | "voice" | "edit";
export type LangId = "zh" | "en";
export type ClipKind = "scene" | "component" | "text" | "subtitle" | "overlay" | "audio" | "trans" | "transition";

export interface TabChangeDetail {
  old: TabId;
  new: TabId;
}

export interface LangChangeDetail {
  old: LangId;
  new: LangId;
}

export interface ClipSelectDetail {
  id: string;
  kind: ClipKind;
  duration: number;
}

export interface TimelineClipSelectDetail {
  track: ClipKind;
  "clip-id": string;
}

export interface TimelineTrackSelectDetail {
  track: ClipKind;
  "track-id": string;
}

export interface PlayheadMoveDetail {
  time: number;
}

export interface AnchorHoverDetail {
  name: string;
  time: number;
}

export interface FieldEditDetail {
  field: string;
  value: string | Record<string, unknown>;
}

export const nfBus = new EventTarget();

export function emitBus<T>(name: string, detail: T): void {
  nfBus.dispatchEvent(new CustomEvent<T>(name, { detail }));
}
