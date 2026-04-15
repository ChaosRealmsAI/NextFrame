// Provides immutable helpers for adding, moving, resizing, and querying legacy timeline clips.
function clone(value: any) {
  return JSON.parse(JSON.stringify(value));
}

function tracksOf(timeline: any) {
  return Array.isArray(timeline.tracks) ? timeline.tracks : [];
}

function markersOf(timeline: any) {
  return Array.isArray(timeline.markers) ? timeline.markers : [];
}

function assetsOf(timeline: any) {
  return Array.isArray(timeline.assets) ? timeline.assets : [];
}

function ensureTrack(timeline: any, trackId: any) {
  timeline.tracks = tracksOf(timeline);
  let track = timeline.tracks.find((entry: any) => entry.id === trackId);
  if (!track) {
    track = {
      id: trackId,
      kind: trackId.startsWith("a") ? "audio" : "video",
      clips: [],
    };
    timeline.tracks.push(track);
  }
  track.clips = Array.isArray(track.clips) ? track.clips : [];
  return track;
}

function listAllClips(timeline: any) {
  const clips = [];
  for (const track of tracksOf(timeline)) {
    for (const clip of track.clips || []) {
      clips.push({ track, clip });
    }
  }
  return clips;
}

function findClipLocation(timeline: any, clipId: any) {
  for (const track of tracksOf(timeline)) {
    for (let index = 0; index < (track.clips || []).length; index += 1) {
      const clip = track.clips[index];
      if (clip.id === clipId) {
        return { track, clip, index };
      }
    }
  }
  return null;
}

function clipEnd(start: any, dur: any) {
  if (typeof start !== "number" || typeof dur !== "number") return null;
  return start + dur;
}

function numericOutOfRange(timeline: any, start: any, dur: any) {
  const end = clipEnd(start, dur);
  if (end === null) return null;
  if (start < 0 || dur < 0 || end > timeline.duration) {
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

function duplicateClipId(timeline: any, clipId: any) {
  return listAllClips(timeline).some(({ clip }) => clip.id === clipId);
}

export function nextSceneClipId(timeline: any, sceneId: any) {
  let max = 0;
  const pattern = new RegExp(`^${escapeRegExp(sceneId)}-(\\d+)$`);
  for (const { clip } of listAllClips(timeline)) {
    const match = clip.id?.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > max) max = value;
  }
  return `${sceneId}-${max + 1}`;
}

function escapeRegExp(value: any) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function addClip(timeline: any, trackId: any, clip: any) {
  if (!clip || typeof clip !== "object") {
    return { ok: false, error: { code: "BAD_CLIP", message: "clip must be an object" } };
  }
  if (!clip.scene || typeof clip.scene !== "string") {
    return { ok: false, error: { code: "BAD_CLIP", message: "clip.scene is required" } };
  }
  if (clip.start === undefined || clip.dur === undefined) {
    return { ok: false, error: { code: "BAD_CLIP", message: "clip.start and clip.dur are required" } };
  }
  const next = clone(timeline);
  const newClip = clone(clip);
  newClip.id = newClip.id || nextSceneClipId(next, newClip.scene);
  newClip.params = newClip.params && typeof newClip.params === "object" ? clone(newClip.params) : {};
  if (duplicateClipId(next, newClip.id)) {
    return {
      ok: false,
      error: { code: "DUP_CLIP_ID", message: `clip "${newClip.id}" already exists`, ref: newClip.id },
    };
  }
  const rangeError = numericOutOfRange(next, newClip.start, newClip.dur);
  if (rangeError) return rangeError;
  const track = tracksOf(next).find((entry: any) => entry.id === trackId);
  if (!track) {
    return {
      ok: false,
      error: { code: "TRACK_NOT_FOUND", message: `no track "${trackId}"`, ref: trackId },
    };
  }
  track.clips = Array.isArray(track.clips) ? track.clips : [];
  track.clips.push(newClip);
  return { ok: true, value: next, clipId: newClip.id };
}

export function removeClip(timeline: any, clipId: any) {
  const next = clone(timeline);
  const found = findClipLocation(next, clipId);
  if (!found) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  found.track.clips.splice(found.index, 1);
  next.tracks = tracksOf(next).filter((track: any) => (track.clips || []).length > 0);
  return { ok: true, value: next, removed: clipId };
}

export function moveClip(timeline: any, clipId: any, newStart: any) {
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

export function resizeClip(timeline: any, clipId: any, newDur: any) {
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

export function setParam(timeline: any, clipId: any, key: any, value: any) {
  const next = clone(timeline);
  const found = findClipLocation(next, clipId);
  if (!found) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  found.clip.params = { ...(found.clip.params || {}), [key]: clone(value) };
  return { ok: true, value: next, clipId, key, paramValue: clone(value) };
}

export function addMarker(timeline: any, marker: any) {
  if (!marker || typeof marker !== "object" || !marker.id) {
    return { ok: false, error: { code: "BAD_MARKER", message: "marker.id is required" } };
  }
  const at = marker.at ?? marker.t;
  if (typeof at !== "number" || !Number.isFinite(at)) {
    return { ok: false, error: { code: "BAD_MARKER", message: "marker.at must be a finite number" } };
  }
  if (at < 0 || at > timeline.duration) {
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message: `marker "${marker.id}" is outside the timeline`,
        hint: `timeline.duration is ${timeline.duration}`,
      },
    };
  }
  const next = clone(timeline);
  next.markers = markersOf(next);
  if (next.markers.some((entry: any) => entry.id === marker.id)) {
    return {
      ok: false,
      error: { code: "DUP_MARKER_ID", message: `marker "${marker.id}" already exists`, ref: marker.id },
    };
  }
  next.markers.push({ id: marker.id, at, t: at, ...(marker.label ? { label: marker.label } : {}) });
  return { ok: true, value: next, markerId: marker.id };
}

export function duplicateClip(timeline: any, clipId: any, newStart: any) {
  const next = clone(timeline);
  const found = findClipLocation(next, clipId);
  if (!found) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  const rangeError = numericOutOfRange(next, newStart, found.clip.dur);
  if (rangeError) return rangeError;
  const dupe = clone(found.clip);
  dupe.id = nextSceneClipId(next, dupe.scene);
  dupe.start = clone(newStart);
  found.track.clips.push(dupe);
  return { ok: true, value: next, clipId: dupe.id };
}

export function listClipTracks(timeline: any) {
  return tracksOf(timeline).map((track: any) => ({
    id: track.id,
    kind: track.kind,
    clips: (track.clips || []).map((clip: any) => clone(clip))
  }));
}

export function findClips(timeline: any, predicate = {}) {
  const ids = [];
  for (const track of tracksOf(timeline)) {
    if (predicate.trackId && track.id !== predicate.trackId) continue;
    for (const clip of track.clips || []) {
      if (predicate.sceneId && clip.scene !== predicate.sceneId) continue;
      if (predicate.hasParam && !(predicate.hasParam.key in (clip.params || {}))) continue;
      if (predicate.textContent) {
        const textValues = Object.values(clip.params || {}).filter((entry) => typeof entry === "string");
        if (!textValues.some((entry) => entry.includes(predicate.textContent))) continue;
      }
      ids.push(clip.id);
    }
  }
  return ids;
}

export function getClip(timeline: any, clipId: any) {
  return findClipLocation(timeline, clipId)?.clip || null;
}

export function ensureTimelineCollections(timeline: any) {
  const next = clone(timeline);
  next.tracks = tracksOf(next);
  next.chapters = Array.isArray(next.chapters) ? next.chapters : [];
  next.markers = markersOf(next);
  next.assets = assetsOf(next);
  return next;
}
