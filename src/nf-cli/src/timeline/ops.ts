// Provides immutable helpers for adding, moving, resizing, and querying legacy timeline clips.
import type { Timeline, Track, Clip, Marker } from "../../../nf-core/types.js";

/** Loose timeline — may have incomplete fields before validation */
type LooseTimeline = Record<string, unknown> & Partial<Timeline>;
type LooseTrack = Record<string, unknown> & Partial<Track>;
type LooseClip = Record<string, unknown> & Partial<Clip>;
type LooseMarker = Record<string, unknown> & { id?: string; at?: number; t?: number; label?: string };

interface OpError { code: string; message: string; ref?: string; hint?: string }
type OpResult = { ok: true; value: LooseTimeline; [key: string]: unknown } | { ok: false; error: OpError };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function tracksOf(timeline: LooseTimeline): LooseTrack[] {
  return Array.isArray(timeline.tracks) ? timeline.tracks as LooseTrack[] : [];
}

function markersOf(timeline: LooseTimeline): LooseMarker[] {
  return Array.isArray(timeline.markers) ? timeline.markers as LooseMarker[] : [];
}

function assetsOf(timeline: LooseTimeline): Record<string, unknown>[] {
  return Array.isArray(timeline.assets) ? timeline.assets as unknown as Record<string, unknown>[] : [];
}

function ensureTrack(timeline: LooseTimeline, trackId: string): LooseTrack {
  timeline.tracks = tracksOf(timeline);
  let track = (timeline.tracks as LooseTrack[]).find((entry) => entry.id === trackId);
  if (!track) {
    track = {
      id: trackId,
      kind: trackId.startsWith("a") ? "audio" : "video",
      clips: [],
    };
    (timeline.tracks as LooseTrack[]).push(track);
  }
  track.clips = Array.isArray(track.clips) ? track.clips : [];
  return track;
}

function listAllClips(timeline: LooseTimeline) {
  const clips: { track: LooseTrack; clip: LooseClip }[] = [];
  for (const track of tracksOf(timeline)) {
    for (const clip of (track.clips || []) as LooseClip[]) {
      clips.push({ track, clip });
    }
  }
  return clips;
}

function findClipLocation(timeline: LooseTimeline, clipId: string) {
  for (const track of tracksOf(timeline)) {
    const trackClips = (track.clips || []) as LooseClip[];
    for (let index = 0; index < trackClips.length; index += 1) {
      const clip = trackClips[index];
      if (clip.id === clipId) {
        return { track, clip, index };
      }
    }
  }
  return null;
}

function clipEnd(start: unknown, dur: unknown): number | null {
  if (typeof start !== "number" || typeof dur !== "number") return null;
  return start + dur;
}

function numericOutOfRange(timeline: LooseTimeline, start: unknown, dur: unknown): { ok: false; error: OpError } | null {
  const end = clipEnd(start, dur);
  if (end === null) return null;
  if ((start as number) < 0 || (dur as number) < 0 || end > (timeline.duration as number)) {
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message: `clip range [${start}, ${end}] exceeds timeline.duration`,
        hint: `timeline.duration is ${timeline.duration}`,
      },
    };
  }
  return null;
}

function duplicateClipId(timeline: LooseTimeline, clipId: string): boolean {
  return listAllClips(timeline).some(({ clip }) => clip.id === clipId);
}

export function nextSceneClipId(timeline: LooseTimeline, sceneId: string): string {
  let max = 0;
  const pattern = new RegExp(`^${escapeRegExp(sceneId)}-(\\d+)$`);
  for (const { clip } of listAllClips(timeline)) {
    const match = (clip.id as string | undefined)?.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > max) max = value;
  }
  return `${sceneId}-${max + 1}`;
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function addClip(timeline: LooseTimeline, trackId: string, clip: unknown): OpResult {
  if (!clip || typeof clip !== "object") {
    return { ok: false, error: { code: "BAD_CLIP", message: "clip must be an object" } };
  }
  const c = clip as LooseClip;
  if (!c.scene || typeof c.scene !== "string") {
    return { ok: false, error: { code: "BAD_CLIP", message: "clip.scene is required" } };
  }
  if (c.start === undefined || c.dur === undefined) {
    return { ok: false, error: { code: "BAD_CLIP", message: "clip.start and clip.dur are required" } };
  }
  const next = clone(timeline);
  const newClip = clone(c);
  newClip.id = newClip.id || nextSceneClipId(next, newClip.scene as string);
  newClip.params = newClip.params && typeof newClip.params === "object" ? clone(newClip.params) : {};
  if (duplicateClipId(next, newClip.id as string)) {
    return {
      ok: false,
      error: { code: "DUP_CLIP_ID", message: `clip "${newClip.id}" already exists`, ref: newClip.id as string },
    };
  }
  const rangeError = numericOutOfRange(next, newClip.start, newClip.dur);
  if (rangeError) return rangeError;
  const track = tracksOf(next).find((entry) => entry.id === trackId);
  if (!track) {
    return {
      ok: false,
      error: { code: "TRACK_NOT_FOUND", message: `no track "${trackId}"`, ref: trackId },
    };
  }
  track.clips = Array.isArray(track.clips) ? track.clips : [];
  (track.clips as LooseClip[]).push(newClip);
  return { ok: true, value: next, clipId: newClip.id };
}

export function removeClip(timeline: LooseTimeline, clipId: string): OpResult {
  const next = clone(timeline);
  const found = findClipLocation(next, clipId);
  if (!found) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  (found.track.clips as LooseClip[]).splice(found.index, 1);
  next.tracks = tracksOf(next).filter((track) => ((track.clips || []) as LooseClip[]).length > 0);
  return { ok: true, value: next, removed: clipId };
}

export function moveClip(timeline: LooseTimeline, clipId: string, newStart: number): OpResult {
  const next = clone(timeline);
  const found = findClipLocation(next, clipId);
  if (!found) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  const rangeError = numericOutOfRange(next, newStart, found.clip.dur);
  if (rangeError) return rangeError;
  found.clip.start = clone(newStart);
  return { ok: true, value: next, clipId, start: found.clip.start };
}

export function resizeClip(timeline: LooseTimeline, clipId: string, newDur: number): OpResult {
  const next = clone(timeline);
  const found = findClipLocation(next, clipId);
  if (!found) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  const rangeError = numericOutOfRange(next, found.clip.start, newDur);
  if (rangeError) return rangeError;
  found.clip.dur = newDur;
  return { ok: true, value: next, clipId, newDuration: newDur };
}

export function setParam(timeline: LooseTimeline, clipId: string, key: string, value: unknown): OpResult {
  const next = clone(timeline);
  const found = findClipLocation(next, clipId);
  if (!found) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  found.clip.params = { ...((found.clip.params || {}) as Record<string, unknown>), [key]: clone(value) };
  return { ok: true, value: next, clipId, key, paramValue: clone(value) };
}

export function addMarker(timeline: LooseTimeline, marker: unknown): OpResult {
  if (!marker || typeof marker !== "object" || !(marker as LooseMarker).id) {
    return { ok: false, error: { code: "BAD_MARKER", message: "marker.id is required" } };
  }
  const m = marker as LooseMarker;
  const at = m.at ?? m.t;
  if (typeof at !== "number" || !Number.isFinite(at)) {
    return { ok: false, error: { code: "BAD_MARKER", message: "marker.at must be a finite number" } };
  }
  if (at < 0 || at > (timeline.duration as number)) {
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message: `marker "${m.id}" is outside the timeline`,
        hint: `timeline.duration is ${timeline.duration}`,
      },
    };
  }
  const next = clone(timeline);
  const nextMarkers = markersOf(next);
  next.markers = nextMarkers as unknown as typeof next.markers;
  if (nextMarkers.some((entry) => entry.id === m.id)) {
    return {
      ok: false,
      error: { code: "DUP_MARKER_ID", message: `marker "${m.id}" already exists`, ref: m.id },
    };
  }
  nextMarkers.push({ id: m.id, at, t: at, ...(m.label ? { label: m.label } : {}) });
  return { ok: true, value: next, markerId: m.id };
}

export function duplicateClip(timeline: LooseTimeline, clipId: string, newStart: number): OpResult {
  const next = clone(timeline);
  const found = findClipLocation(next, clipId);
  if (!found) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  const rangeError = numericOutOfRange(next, newStart, found.clip.dur);
  if (rangeError) return rangeError;
  const dupe = clone(found.clip);
  dupe.id = nextSceneClipId(next, dupe.scene as string);
  dupe.start = clone(newStart);
  (found.track.clips as LooseClip[]).push(dupe);
  return { ok: true, value: next, clipId: dupe.id };
}

export function listClipTracks(timeline: LooseTimeline) {
  return tracksOf(timeline).map((track) => ({
    id: track.id,
    kind: track.kind,
    clips: ((track.clips || []) as LooseClip[]).map((clip) => clone(clip))
  }));
}

interface ClipPredicate {
  trackId?: string;
  sceneId?: string;
  hasParam?: { key: string };
  textContent?: string;
}

export function findClips(timeline: LooseTimeline, predicate: ClipPredicate = {}) {
  const ids: string[] = [];
  for (const track of tracksOf(timeline)) {
    if (predicate.trackId && track.id !== predicate.trackId) continue;
    for (const clip of (track.clips || []) as LooseClip[]) {
      if (predicate.sceneId && clip.scene !== predicate.sceneId) continue;
      if (predicate.hasParam && !(predicate.hasParam.key in ((clip.params || {}) as Record<string, unknown>))) continue;
      if (predicate.textContent) {
        const textValues = Object.values((clip.params || {}) as Record<string, unknown>).filter((entry) => typeof entry === "string") as string[];
        if (!textValues.some((entry) => entry.includes(predicate.textContent!))) continue;
      }
      ids.push(clip.id as string);
    }
  }
  return ids;
}

export function getClip(timeline: LooseTimeline, clipId: string) {
  return findClipLocation(timeline, clipId)?.clip || null;
}

export function ensureTimelineCollections(timeline: LooseTimeline) {
  const next = clone(timeline);
  next.tracks = tracksOf(next) as unknown as typeof next.tracks;
  next.chapters = Array.isArray(next.chapters) ? next.chapters : [];
  next.markers = markersOf(next) as unknown as typeof next.markers;
  next.assets = assetsOf(next) as unknown as typeof next.assets;
  return next;
}
