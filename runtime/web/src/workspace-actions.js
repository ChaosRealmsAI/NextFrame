import { copy as copyToClipboard, read as readClipboard } from "./clipboard.js";
import { duplicateClipsCommand, pasteClipsCommand, removeClipsCommand } from "./commands.js";

function uniqueClipIds(clipIds) {
  const ids = [];
  const seen = new Set();

  (Array.isArray(clipIds) ? clipIds : []).forEach((clipId) => {
    if (clipId == null) {
      return;
    }

    const normalized = String(clipId);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    ids.push(normalized);
  });

  return ids;
}

export function getSelectedClipIds(store) {
  const state = store?.state;
  const clipIds = Array.isArray(state?.selection?.clipIds)
    ? state.selection.clipIds.filter((clipId) => typeof clipId === "string" && clipId.length > 0)
    : [];
  const uniqueIds = [...new Set(clipIds)];
  const primaryClipId = typeof state?.selectedClipId === "string" && state.selectedClipId.length > 0
    ? state.selectedClipId
    : null;

  if (primaryClipId && !uniqueIds.includes(primaryClipId)) {
    uniqueIds.push(primaryClipId);
  }

  return uniqueIds;
}

export function getClipEntriesByIds(store, clipIds) {
  const selectedIds = new Set(uniqueClipIds(clipIds));
  if (selectedIds.size === 0) {
    return [];
  }

  return (store?.state?.timeline?.tracks || [])
    .flatMap((track) => (track?.clips || []).map((clip) => ({
      trackId: track?.id ?? null,
      clip,
    })))
    .filter((entry) => entry.trackId && selectedIds.has(entry.clip?.id))
    .sort((left, right) => {
      const startDelta = (Number(left?.clip?.start) || 0) - (Number(right?.clip?.start) || 0);
      if (startDelta !== 0) {
        return startDelta;
      }

      const trackDelta = String(left?.trackId ?? "").localeCompare(String(right?.trackId ?? ""));
      if (trackDelta !== 0) {
        return trackDelta;
      }

      return String(left?.clip?.id ?? "").localeCompare(String(right?.clip?.id ?? ""));
    });
}

export function getSelectedClips(store) {
  return getClipEntriesByIds(store, getSelectedClipIds(store));
}

export function getFirstTrackId(store, kind = "video") {
  const targetKind = kind === "audio" ? "audio" : "video";
  const track = (store?.state?.timeline?.tracks || []).find((candidate) => candidate?.kind === targetKind);
  return track?.id ?? null;
}

export function hasClipboardClips() {
  return readClipboard().length > 0;
}

export function copyClipIds(store, clipIds) {
  const clips = getClipEntriesByIds(store, clipIds).map((entry) => entry.clip);
  if (clips.length === 0) {
    return false;
  }

  copyToClipboard(clips);
  return true;
}

export function copySelectedClips(store) {
  return copyClipIds(store, getSelectedClipIds(store));
}

export function removeClipIds(store, clipIds) {
  const ids = uniqueClipIds(clipIds);
  if (ids.length === 0 || typeof store?.dispatch !== "function") {
    return false;
  }

  store.dispatch(removeClipsCommand({ clipIds: ids }));
  return true;
}

export function removeSelectedClips(store) {
  return removeClipIds(store, getSelectedClipIds(store));
}

export function cutClipIds(store, clipIds) {
  if (!copyClipIds(store, clipIds)) {
    return false;
  }

  return removeClipIds(store, clipIds);
}

export function cutSelectedClips(store) {
  return cutClipIds(store, getSelectedClipIds(store));
}

export function pasteClipboardClips(store, { trackId = getFirstTrackId(store, "video"), targetStart } = {}) {
  const clips = readClipboard();
  if (clips.length === 0 || !trackId || typeof store?.dispatch !== "function") {
    return false;
  }

  store.dispatch(pasteClipsCommand({
    clips,
    targetStart: Number.isFinite(targetStart) ? targetStart : Number(store?.state?.playhead) || 0,
    trackId,
  }));
  return true;
}

export function duplicateClipIds(store, clipIds) {
  const ids = uniqueClipIds(clipIds);
  if (ids.length === 0 || typeof store?.dispatch !== "function") {
    return false;
  }

  store.dispatch(duplicateClipsCommand({ clipIds: ids }));
  return true;
}

export function duplicateSelectedClips(store) {
  return duplicateClipIds(store, getSelectedClipIds(store));
}

export function addTrack(store, kind) {
  const normalizedKind = kind === "audio" ? "audio" : "video";
  const idPrefix = normalizedKind === "audio" ? "a" : "v";
  const labelPrefix = normalizedKind === "audio" ? "A" : "V";
  const namePrefix = normalizedKind === "audio" ? "Audio" : "Video";

  if (typeof store?.mutate !== "function") {
    return false;
  }

  store.mutate((state) => {
    const timeline = state.timeline || { version: "1", duration: 30, tracks: [] };
    const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
    const kindTracks = tracks.filter((track) => track?.kind === normalizedKind);

    let nextIndex = kindTracks.length + 1;
    let nextId = `${idPrefix}${nextIndex}`;
    while (tracks.some((track) => track?.id === nextId)) {
      nextIndex += 1;
      nextId = `${idPrefix}${nextIndex}`;
    }

    state.timeline = {
      ...timeline,
      tracks: [
        ...tracks,
        {
          id: nextId,
          label: `${labelPrefix}${nextIndex}`,
          name: `${namePrefix} ${nextIndex}`,
          kind: normalizedKind,
          clips: [],
        },
      ],
    };
  });

  return true;
}
