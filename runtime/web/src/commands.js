import {
  CLIP_SNAP_STEP,
  MIN_CLIP_DURATION,
  clampClipDuration,
  getClipDuration,
  hasTrackOverlap,
  roundClipTime,
  snapClipTime,
} from "./timeline/clip-range.js";
import { createProjectFromPreset, normalizeProjectState } from "./project/presets.js";

function cloneValue(value) {
  if (value instanceof Map) {
    return new Map([...value.entries()].map(([key, entryValue]) => [cloneValue(key), cloneValue(entryValue)]));
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, cloneValue(entryValue)]),
    );
  }

  return value;
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const ABORT_COMMAND = Symbol("abort-command");
let generatedClipId = 0;

function assertCommand(command) {
  if (!command || typeof command !== "object") {
    throw new TypeError("dispatch(cmd) requires a command object");
  }

  if (typeof command.type !== "string" || command.type.length === 0) {
    throw new TypeError("commands require a non-empty string type");
  }
}

function cloneTracks(timeline) {
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  return tracks.map((track) => ({
    ...track,
    clips: Array.isArray(track?.clips)
      ? track.clips.map((clip) => ({
          ...clip,
          params: clip?.params && typeof clip.params === "object"
            ? { ...clip.params }
            : clip?.params,
        }))
      : [],
  }));
}

function getTimelineState(state) {
  return state?.timeline && typeof state.timeline === "object"
    ? state.timeline
    : { version: "1", duration: 0, tracks: [] };
}

function withUpdatedTimeline(state, tracks) {
  return {
    ...state,
    timeline: {
      ...getTimelineState(state),
      tracks,
    },
  };
}

function sortClips(clips) {
  return [...clips].sort((left, right) => {
    const startDelta = (Number(left?.start) || 0) - (Number(right?.start) || 0);
    if (startDelta !== 0) {
      return startDelta;
    }

    return String(left?.id ?? "").localeCompare(String(right?.id ?? ""));
  });
}

function createClipId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  generatedClipId += 1;
  return `clip-${Date.now()}-${generatedClipId}`;
}

function findTrackIndex(tracks, trackId) {
  return tracks.findIndex((track) => track?.id === trackId);
}

function findClipLocation(tracks, clipId, preferredTrackId = null) {
  if (preferredTrackId) {
    const preferredIndex = findTrackIndex(tracks, preferredTrackId);
    if (preferredIndex >= 0) {
      const clipIndex = tracks[preferredIndex].clips.findIndex((clip) => clip?.id === clipId);
      if (clipIndex >= 0) {
        return {
          trackIndex: preferredIndex,
          clipIndex,
        };
      }
    }
  }

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const clipIndex = tracks[trackIndex].clips.findIndex((clip) => clip?.id === clipId);
    if (clipIndex >= 0) {
      return {
        trackIndex,
        clipIndex,
      };
    }
  }

  return null;
}

function findTrackIdByClipId(tracks, clipId) {
  const location = findClipLocation(tracks, clipId);
  return location ? tracks[location.trackIndex]?.id ?? null : null;
}

function normalizeClipStart(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return roundClipTime(fallback);
  }

  return roundClipTime(numeric);
}

function normalizeClipDuration(value, fallback = 0.1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return clampClipDuration(fallback);
  }

  return clampClipDuration(numeric);
}

function normalizeSplitDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Number(numeric.toFixed(4));
}

function getPreviousClip(prevState, clipId, trackId) {
  const tracks = Array.isArray(prevState?.timeline?.tracks) ? prevState.timeline.tracks : [];
  const location = findClipLocation(tracks, clipId, trackId);
  if (!location) {
    return null;
  }

  return {
    trackId: tracks[location.trackIndex]?.id ?? trackId ?? null,
    clip: cloneValue(tracks[location.trackIndex].clips[location.clipIndex]),
  };
}

function uniqueClipIds(clipIds) {
  const ids = [];
  const seen = new Set();

  (Array.isArray(clipIds) ? clipIds : []).forEach((clipId) => {
    if (clipId == null) {
      return;
    }

    const normalized = String(clipId);
    if (normalized.length === 0 || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    ids.push(normalized);
  });

  return ids;
}

function getTimelineTracks(state) {
  return Array.isArray(state?.timeline?.tracks) ? state.timeline.tracks : [];
}

function getClipsByIds(state, clipIds) {
  const tracks = getTimelineTracks(state);

  return uniqueClipIds(clipIds)
    .map((clipId) => {
      const location = findClipLocation(tracks, clipId);
      if (!location) {
        return null;
      }

      const track = tracks[location.trackIndex];
      const clip = track?.clips?.[location.clipIndex];
      if (!clip) {
        return null;
      }

      return {
        trackId: track?.id ?? null,
        clip: cloneValue(clip),
      };
    })
    .filter(Boolean)
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

function getSelectionClipIds(selection, selectedClipId = null) {
  const clipIds = uniqueClipIds(selection?.clipIds);
  const primaryClipId = selectedClipId == null ? null : String(selectedClipId);

  if (primaryClipId && !clipIds.includes(primaryClipId)) {
    clipIds.push(primaryClipId);
  }

  return clipIds;
}

function normalizeSelectionPayload(state, payload = {}) {
  const tracks = Array.isArray(state?.timeline?.tracks) ? state.timeline.tracks : [];
  const requestedClipIds = payload.clipIds ?? (payload.clipId != null ? [payload.clipId] : []);
  const clipIds = uniqueClipIds(requestedClipIds).filter((clipId) => Boolean(findClipLocation(tracks, clipId)));
  const preferredClipId = payload.clipId == null ? null : String(payload.clipId);
  const clipId = preferredClipId && clipIds.includes(preferredClipId)
    ? preferredClipId
    : clipIds.at(-1) ?? null;

  let trackId;
  if (Object.prototype.hasOwnProperty.call(payload, "trackId") && payload.trackId !== undefined) {
    trackId = payload.trackId == null ? null : String(payload.trackId);
  } else if (clipId) {
    trackId = findTrackIdByClipId(tracks, clipId);
  } else {
    trackId = state?.selection?.trackId ?? null;
  }

  return {
    trackId,
    clipId,
    clipIds,
    selectedClipId: clipId,
  };
}

function applySelectionToState(state, payload = {}) {
  const nextSelection = normalizeSelectionPayload(state, payload);

  return {
    ...state,
    selectedClipId: nextSelection.selectedClipId,
    selection: {
      trackId: nextSelection.trackId,
      clipId: nextSelection.clipId,
      clipIds: nextSelection.clipIds,
    },
  };
}

function removeClipFromSelection(state, clipId) {
  const removedClipId = clipId == null ? null : String(clipId);
  const clipIds = getSelectionClipIds(state?.selection, state?.selectedClipId)
    .filter((candidate) => candidate !== removedClipId);
  const primaryClipId = state?.selectedClipId === removedClipId
    ? clipIds.at(-1) ?? null
    : state?.selectedClipId ?? null;

  return applySelectionToState(state, {
    clipId: primaryClipId,
    clipIds,
  });
}

export function moveClipCommand({ clipId, newStart, newDur }) {
  let previousClip = null;
  let didApply = false;

  return {
    type: "moveClip",
    clipId,
    newStart,
    newDur,
    exec(state) {
      const tracks = cloneTracks(getTimelineState(state));
      const location = findClipLocation(tracks, clipId);
      if (!location) {
        throw new Error(`moveClip: clip "${clipId}" not found`);
      }

      const track = tracks[location.trackIndex];
      const clip = track.clips[location.clipIndex];
      const previousStart = Number(clip?.start) || 0;
      const previousDur = getClipDuration(clip);
      const nextStart = normalizeClipStart(newStart, previousStart);
      const nextDur = normalizeClipDuration(newDur ?? previousDur, previousDur);

      if (nextStart === previousStart && nextDur === previousDur) {
        return ABORT_COMMAND;
      }

      if (hasTrackOverlap(track, nextStart, nextDur, { ignoreClipId: clipId })) {
        return ABORT_COMMAND;
      }

      previousClip = {
        start: previousStart,
        dur: previousDur,
      };
      didApply = true;

      const nextClip = {
        ...clip,
        start: nextStart,
        dur: nextDur,
      };

      if (Object.prototype.hasOwnProperty.call(nextClip, "duration")) {
        nextClip.duration = nextDur;
      }

      const nextClips = [...track.clips];
      nextClips[location.clipIndex] = nextClip;
      tracks[location.trackIndex] = {
        ...track,
        clips: sortClips(nextClips),
      };

      return withUpdatedTimeline(state, tracks);
    },
    invert() {
      if (!didApply || !previousClip) {
        return null;
      }

      return moveClipCommand({
        clipId,
        newStart: previousClip.start,
        newDur: previousClip.dur,
      });
    },
  };
}

export function removeClipCommand({ clipId, trackId = null }) {
  let previous = null;
  let didApply = false;

  return {
    type: "removeClip",
    clipId,
    trackId,
    exec(state) {
      const tracks = cloneTracks(getTimelineState(state));
      const location = findClipLocation(tracks, clipId, trackId);
      if (!location) {
        return ABORT_COMMAND;
      }

      const track = tracks[location.trackIndex];
      const clip = track?.clips?.[location.clipIndex];
      if (!clip) {
        return ABORT_COMMAND;
      }

      previous = {
        trackId: track?.id ?? trackId ?? null,
        clip: cloneValue(clip),
      };
      didApply = true;

      tracks[location.trackIndex] = {
        ...track,
        clips: track.clips.filter((candidate) => candidate?.id !== clipId),
      };

      return removeClipFromSelection(withUpdatedTimeline(state, tracks), clipId);
    },
    invert() {
      if (!didApply || !previous?.trackId || !previous?.clip) {
        return null;
      }

      return {
        type: "addClip",
        trackId: previous.trackId,
        clip: cloneValue(previous.clip),
      };
    },
  };
}

export function splitClipCommand({ clipId, splitTime, trackId = null, newClipId = null }) {
  return {
    type: "splitClip",
    clipId,
    splitTime,
    trackId,
    newClipId,
  };
}

export function batchCommand(commands) {
  return {
    type: "batch",
    commands: Array.isArray(commands) ? commands : [],
  };
}

export function removeClipsCommand({ clipIds }) {
  return batchCommand(
    uniqueClipIds(clipIds).map((clipId) => removeClipCommand({ clipId })),
  );
}

function normalizePasteClips(clips) {
  return (Array.isArray(clips) ? clips : [])
    .filter((clip) => clip && typeof clip === "object")
    .map((clip) => {
      const nextClip = cloneValue(clip);
      const duration = normalizeClipDuration(getClipDuration(nextClip), MIN_CLIP_DURATION);
      nextClip.start = normalizeClipStart(nextClip.start, 0);
      nextClip.dur = duration;
      if (Object.prototype.hasOwnProperty.call(nextClip, "duration")) {
        nextClip.duration = duration;
      }

      return nextClip;
    });
}

function clipsOverlapEachOther(clips) {
  const sorted = sortClips(clips);
  for (let index = 0; index < sorted.length; index += 1) {
    const clip = sorted[index];
    const clipStart = Number(clip?.start) || 0;
    const clipEnd = clipStart + getClipDuration(clip);

    for (let candidateIndex = index + 1; candidateIndex < sorted.length; candidateIndex += 1) {
      const candidate = sorted[candidateIndex];
      const candidateStart = Number(candidate?.start) || 0;
      if (candidateStart >= clipEnd) {
        break;
      }

      const candidateEnd = candidateStart + getClipDuration(candidate);
      if (clipStart < candidateEnd && candidateStart < clipEnd) {
        return true;
      }
    }
  }

  return false;
}

function resolvePasteInsertion(track, clips, targetStart) {
  const normalizedClips = normalizePasteClips(clips);
  if (normalizedClips.length === 0) {
    return null;
  }

  if (clipsOverlapEachOther(normalizedClips)) {
    return null;
  }

  const baseline = normalizedClips.reduce(
    (minimum, clip) => Math.min(minimum, Number(clip?.start) || 0),
    Number.POSITIVE_INFINITY,
  );
  let candidateStart = snapClipTime(targetStart);

  while (candidateStart < Number.MAX_SAFE_INTEGER) {
    const placedClips = normalizedClips.map((clip) => {
      const relativeStart = (Number(clip?.start) || 0) - baseline;
      const duration = normalizeClipDuration(getClipDuration(clip), MIN_CLIP_DURATION);
      const placedClip = {
        ...cloneValue(clip),
        id: createClipId(),
        start: roundClipTime(candidateStart + relativeStart),
        dur: duration,
      };

      if (Object.prototype.hasOwnProperty.call(placedClip, "duration")) {
        placedClip.duration = duration;
      }

      return placedClip;
    });

    if (!clipsOverlapEachOther(placedClips) && placedClips.every((clip) => {
      return !hasTrackOverlap(track, clip.start, getClipDuration(clip));
    })) {
      return placedClips;
    }

    candidateStart = roundClipTime(candidateStart + CLIP_SNAP_STEP);
  }

  return null;
}

export function pasteClipsCommand({ clips, targetStart, trackId }) {
  let insertedClips = [];
  let didApply = false;

  return {
    type: "pasteClips",
    clips,
    targetStart,
    trackId,
    exec(state) {
      const tracks = cloneTracks(getTimelineState(state));
      const trackIndex = findTrackIndex(tracks, trackId);
      if (trackIndex < 0) {
        return ABORT_COMMAND;
      }

      const track = tracks[trackIndex];
      const placedClips = resolvePasteInsertion(track, clips, targetStart);
      if (!placedClips || placedClips.length === 0) {
        return ABORT_COMMAND;
      }

      insertedClips = placedClips.map((clip) => cloneValue(clip));
      didApply = true;

      tracks[trackIndex] = {
        ...track,
        clips: sortClips([...track.clips, ...placedClips]),
      };

      return applySelectionToState(withUpdatedTimeline(state, tracks), {
        trackId,
        clipId: insertedClips.at(-1)?.id ?? null,
        clipIds: insertedClips.map((clip) => clip.id).filter(Boolean),
      });
    },
    invert() {
      if (!didApply || insertedClips.length === 0) {
        return null;
      }

      return removeClipsCommand({
        clipIds: insertedClips.map((clip) => clip.id),
      });
    },
  };
}

export function duplicateClipsCommand({ clipIds }) {
  let inverseCommand = null;

  return {
    type: "duplicateClips",
    clipIds,
    exec(state) {
      const clips = getClipsByIds(state, clipIds);
      if (clips.length === 0) {
        return ABORT_COMMAND;
      }

      const firstTrackId = clips[0]?.trackId ?? null;
      if (!firstTrackId || clips.some((entry) => entry.trackId !== firstTrackId)) {
        return ABORT_COMMAND;
      }

      const maxEnd = clips.reduce((maximum, entry) => {
        const start = Number(entry?.clip?.start) || 0;
        return Math.max(maximum, start + getClipDuration(entry?.clip));
      }, 0);

      const pasteCommand = pasteClipsCommand({
        clips: clips.map((entry) => entry.clip),
        targetStart: roundClipTime(maxEnd),
        trackId: firstTrackId,
      });
      const draftState = cloneValue(state);
      const result = pasteCommand.exec(draftState);
      if (result === ABORT_COMMAND) {
        return ABORT_COMMAND;
      }

      inverseCommand = pasteCommand.invert();
      return result ?? draftState;
    },
    invert() {
      return inverseCommand;
    },
  };
}

export function setClipFieldCommand({ clipId, trackId = null, field, value }) {
  return {
    type: "setClipField",
    clipId,
    trackId,
    field,
    value,
  };
}

export function randomizeParamsCommand({ clipId, trackId = null, newParams }) {
  return {
    type: "randomizeParams",
    clipId,
    trackId,
    newParams,
  };
}

export function setProjectAspectPresetCommand({ presetId }) {
  return {
    type: "setProjectAspectPreset",
    presetId,
  };
}

function createBuiltInCommand(command) {
  if (typeof command.exec === "function") {
    return command;
  }

  switch (command.type) {
    case "batch": {
      let inverseCommands = [];

      return {
        ...command,
        exec(state) {
          const commands = Array.isArray(command.commands) ? command.commands : [];
          let nextState = state;
          let didApply = false;

          inverseCommands = [];

          for (const entry of commands) {
            const normalized = normalizeCommand(entry);
            const previousState = cloneValue(nextState);
            const draftState = cloneValue(nextState);
            const result = normalized.exec(draftState);

            if (result === ABORT_COMMAND) {
              continue;
            }

            const resolvedState = result ?? draftState;
            if (!resolvedState || typeof resolvedState !== "object") {
              throw new TypeError(`Command "${normalized.type}" must return a state object`);
            }

            nextState = resolvedState;
            didApply = true;

            if (typeof normalized.invert === "function") {
              const inverse = normalized.invert(nextState, previousState);
              if (inverse) {
                inverseCommands.unshift(inverse);
              }
            }
          }

          return didApply ? nextState : ABORT_COMMAND;
        },
        invert() {
          return inverseCommands.length > 0 ? batchCommand(inverseCommands) : null;
        },
      };
    }
    case "addClip":
      return {
        ...command,
        exec(state) {
          const clip = cloneValue(command.clip);
          if (!clip || typeof clip !== "object" || typeof clip.id !== "string" || clip.id.length === 0) {
            throw new TypeError("addClip requires clip.id");
          }

          const tracks = cloneTracks(getTimelineState(state));
          const trackIndex = findTrackIndex(tracks, command.trackId);
          if (trackIndex < 0) {
            throw new Error(`addClip: track "${command.trackId}" not found`);
          }

          tracks[trackIndex] = {
            ...tracks[trackIndex],
            clips: sortClips([...tracks[trackIndex].clips, clip]),
          };

          return withUpdatedTimeline(state, tracks);
        },
        invert(nextState) {
          return {
            type: "removeClip",
            trackId: command.trackId,
            clipId: command.clip?.id ?? null,
          };
        },
      };
    case "removeClip":
      return {
        ...command,
        exec(state) {
          const tracks = cloneTracks(getTimelineState(state));
          const location = findClipLocation(tracks, command.clipId, command.trackId);
          if (!location) {
            throw new Error(`removeClip: clip "${command.clipId}" not found`);
          }

          const track = tracks[location.trackIndex];
          tracks[location.trackIndex] = {
            ...track,
            clips: track.clips.filter((clip) => clip?.id !== command.clipId),
          };

          return removeClipFromSelection(withUpdatedTimeline(state, tracks), command.clipId);
        },
        invert(nextState, prevState) {
          const previous = getPreviousClip(prevState, command.clipId, command.trackId);
          if (!previous) {
            return null;
          }

          return {
            type: "addClip",
            trackId: previous.trackId,
            clip: previous.clip,
          };
        },
      };
    case "moveClip":
      return {
        ...command,
        exec(state) {
          const tracks = cloneTracks(getTimelineState(state));
          const location = findClipLocation(tracks, command.clipId, command.fromTrackId);
          if (!location) {
            throw new Error(`moveClip: clip "${command.clipId}" not found`);
          }

          const fromTrack = tracks[location.trackIndex];
          const [clip] = fromTrack.clips.splice(location.clipIndex, 1);
          const targetTrackId = command.trackId ?? fromTrack.id;
          const targetTrackIndex = findTrackIndex(tracks, targetTrackId);
          if (targetTrackIndex < 0) {
            throw new Error(`moveClip: target track "${targetTrackId}" not found`);
          }

          const movedClip = {
            ...clip,
            start: Number.isFinite(command.start) ? command.start : clip.start,
          };

          tracks[location.trackIndex] = {
            ...fromTrack,
            clips: sortClips(fromTrack.clips),
          };
          tracks[targetTrackIndex] = {
            ...tracks[targetTrackIndex],
            clips: sortClips([...tracks[targetTrackIndex].clips, movedClip]),
          };

          const nextState = withUpdatedTimeline(state, tracks);
          if (state.selectedClipId !== command.clipId) {
            return nextState;
          }

          return applySelectionToState(nextState, {
            trackId: targetTrackId,
            clipId: state.selectedClipId,
            clipIds: getSelectionClipIds(state.selection, state.selectedClipId),
          });
        },
        invert(nextState, prevState) {
          const previous = getPreviousClip(prevState, command.clipId, command.fromTrackId);
          if (!previous) {
            return null;
          }

          return {
            type: "moveClip",
            clipId: command.clipId,
            fromTrackId: command.trackId ?? previous.trackId,
            trackId: previous.trackId,
            start: previous.clip.start,
          };
        },
      };
    case "splitClip":
      return {
        ...command,
        exec(state) {
          const tracks = cloneTracks(getTimelineState(state));
          const location = findClipLocation(tracks, command.clipId, command.trackId);
          if (!location) {
            throw new Error(`splitClip: clip "${command.clipId}" not found`);
          }

          const track = tracks[location.trackIndex];
          const clip = track.clips[location.clipIndex];
          const clipStart = Number(clip?.start) || 0;
          const clipDur = getClipDuration(clip);
          const clipEnd = clipStart + clipDur;
          const splitTime = snapClipTime(command.splitTime);

          if (
            splitTime <= clipStart
            || splitTime >= clipEnd
            || splitTime - clipStart < MIN_CLIP_DURATION
            || clipEnd - splitTime < MIN_CLIP_DURATION
          ) {
            return ABORT_COMMAND;
          }

          const leftClip = {
            ...clip,
            start: clipStart,
            dur: normalizeSplitDuration(splitTime - clipStart),
          };
          const rightClip = {
            ...cloneValue(clip),
            id: command.newClipId || createClipId(),
            start: splitTime,
            dur: normalizeSplitDuration(clipEnd - splitTime),
          };

          if (Object.prototype.hasOwnProperty.call(leftClip, "duration")) {
            leftClip.duration = leftClip.dur;
          }

          if (Object.prototype.hasOwnProperty.call(rightClip, "duration")) {
            rightClip.duration = rightClip.dur;
          }

          const nextClips = [...track.clips];
          nextClips.splice(location.clipIndex, 1, leftClip, rightClip);
          tracks[location.trackIndex] = {
            ...track,
            clips: sortClips(nextClips),
          };

          return withUpdatedTimeline(state, tracks);
        },
        invert(nextState, prevState) {
          const previous = getPreviousClip(prevState, command.clipId, command.trackId);
          if (!previous) {
            return null;
          }

          const nextTracks = Array.isArray(nextState?.timeline?.tracks) ? nextState.timeline.tracks : [];
          const nextTrackIndex = findTrackIndex(nextTracks, previous.trackId);
          const previousTracks = Array.isArray(prevState?.timeline?.tracks) ? prevState.timeline.tracks : [];
          const previousTrackIndex = findTrackIndex(previousTracks, previous.trackId);
          if (nextTrackIndex < 0 || previousTrackIndex < 0) {
            return null;
          }

          const previousIds = new Set(previousTracks[previousTrackIndex].clips.map((clip) => clip?.id));
          const addedClip = nextTracks[nextTrackIndex].clips.find((clip) => !previousIds.has(clip?.id));
          if (!addedClip?.id) {
            return null;
          }

          return {
            type: "restoreSplitClip",
            trackId: previous.trackId,
            clipId: command.clipId,
            addedClipId: addedClip.id,
            originalClip: previous.clip,
            splitTime: command.splitTime,
          };
        },
      };
    case "restoreSplitClip":
      return {
        ...command,
        exec(state) {
          const tracks = cloneTracks(getTimelineState(state));
          const originalLocation = findClipLocation(tracks, command.clipId, command.trackId);
          const addedLocation = findClipLocation(tracks, command.addedClipId, command.trackId);
          if (!originalLocation || !addedLocation) {
            throw new Error(`restoreSplitClip: could not resolve split pair for "${command.clipId}"`);
          }

          const track = tracks[originalLocation.trackIndex];
          const nextClips = track.clips.filter((clip) => clip?.id !== command.addedClipId);
          const restoreIndex = nextClips.findIndex((clip) => clip?.id === command.clipId);
          nextClips[restoreIndex] = cloneValue(command.originalClip);
          tracks[originalLocation.trackIndex] = {
            ...track,
            clips: sortClips(nextClips),
          };

          return removeClipFromSelection(withUpdatedTimeline(state, tracks), command.addedClipId);
        },
        invert() {
          return splitClipCommand({
            clipId: command.clipId,
            splitTime: command.splitTime,
            trackId: command.trackId,
            newClipId: command.addedClipId,
          });
        },
      };
    case "setClipParam":
      return {
        ...command,
        exec(state) {
          const tracks = cloneTracks(getTimelineState(state));
          const location = findClipLocation(tracks, command.clipId, command.trackId);
          if (!location) {
            throw new Error(`setClipParam: clip "${command.clipId}" not found`);
          }

          const track = tracks[location.trackIndex];
          const clip = track.clips[location.clipIndex];
          const params = clip?.params && typeof clip.params === "object" ? { ...clip.params } : {};

          if (command.value === undefined) {
            delete params[command.param];
          } else {
            params[command.param] = command.value;
          }

          const nextClip = {
            ...clip,
            params,
          };

          const nextClips = [...track.clips];
          nextClips[location.clipIndex] = nextClip;
          tracks[location.trackIndex] = {
            ...track,
            clips: nextClips,
          };

          return withUpdatedTimeline(state, tracks);
        },
        invert(nextState, prevState) {
          const previous = getPreviousClip(prevState, command.clipId, command.trackId);
          if (!previous) {
            return null;
          }

          return {
            type: "setClipParam",
            clipId: command.clipId,
            trackId: previous.trackId,
            param: command.param,
            value: previous.clip?.params?.[command.param],
          };
        },
      };
    case "randomizeParams":
      return {
        ...command,
        exec(state) {
          const tracks = cloneTracks(getTimelineState(state));
          const location = findClipLocation(tracks, command.clipId, command.trackId);
          if (!location) {
            throw new Error(`randomizeParams: clip "${command.clipId}" not found`);
          }

          const track = tracks[location.trackIndex];
          const clip = track.clips[location.clipIndex];
          const nextClip = {
            ...clip,
            params: command.newParams && typeof command.newParams === "object"
              ? cloneValue(command.newParams)
              : {},
          };

          const nextClips = [...track.clips];
          nextClips[location.clipIndex] = nextClip;
          tracks[location.trackIndex] = {
            ...track,
            clips: nextClips,
          };

          return withUpdatedTimeline(state, tracks);
        },
        invert(nextState, prevState) {
          const previous = getPreviousClip(prevState, command.clipId, command.trackId);
          if (!previous) {
            return null;
          }

          return {
            type: "randomizeParams",
            clipId: command.clipId,
            trackId: previous.trackId,
            newParams: previous.clip?.params,
          };
        },
      };
    case "setClipField":
      return {
        ...command,
        exec(state) {
          if (typeof command.field !== "string" || command.field.length === 0) {
            throw new TypeError("setClipField requires a non-empty field");
          }

          const tracks = cloneTracks(getTimelineState(state));
          const location = findClipLocation(tracks, command.clipId, command.trackId);
          if (!location) {
            throw new Error(`setClipField: clip "${command.clipId}" not found`);
          }

          const track = tracks[location.trackIndex];
          const clip = track.clips[location.clipIndex];
          const nextClip = {
            ...clip,
          };

          if (command.value === undefined) {
            delete nextClip[command.field];
          } else {
            nextClip[command.field] = command.value;
          }

          const nextClips = [...track.clips];
          nextClips[location.clipIndex] = nextClip;
          tracks[location.trackIndex] = {
            ...track,
            clips: nextClips,
          };

          return withUpdatedTimeline(state, tracks);
        },
        invert(nextState, prevState) {
          const previous = getPreviousClip(prevState, command.clipId, command.trackId);
          if (!previous) {
            return null;
          }

          return {
            type: "setClipField",
            clipId: command.clipId,
            trackId: previous.trackId,
            field: command.field,
            value: previous.clip?.[command.field],
          };
        },
      };
    case "setProjectAspectPreset":
      return {
        ...command,
        exec(state) {
          const nextProject = createProjectFromPreset(command.presetId);
          const previousProject = normalizeProjectState(state?.project);

          if (
            nextProject.width === previousProject.width
            && nextProject.height === previousProject.height
            && nextProject.aspectRatio === previousProject.aspectRatio
          ) {
            return ABORT_COMMAND;
          }

          return {
            ...state,
            project: nextProject,
            dirty: true,
          };
        },
        invert(nextState, prevState) {
          return {
            type: "setProjectState",
            project: normalizeProjectState(prevState?.project),
            dirty: Boolean(prevState?.dirty),
          };
        },
      };
    case "setProjectState":
      return {
        ...command,
        exec(state) {
          const nextProject = normalizeProjectState(command.project);
          const previousProject = normalizeProjectState(state?.project);
          const nextDirty = Boolean(command.dirty);

          if (
            nextProject.width === previousProject.width
            && nextProject.height === previousProject.height
            && nextProject.aspectRatio === previousProject.aspectRatio
            && nextDirty === Boolean(state?.dirty)
          ) {
            return ABORT_COMMAND;
          }

          return {
            ...state,
            project: nextProject,
            dirty: nextDirty,
          };
        },
        invert(nextState, prevState) {
          return {
            type: "setProjectState",
            project: normalizeProjectState(prevState?.project),
            dirty: Boolean(prevState?.dirty),
          };
        },
      };
    case "setSelection":
      return {
        ...command,
        exec(state) {
          return applySelectionToState(state, {
            trackId: command.trackId,
            clipId: command.clipId ?? null,
            clipIds: command.clipIds ?? [],
          });
        },
        invert(nextState, prevState) {
          return {
            type: "setSelection",
            trackId: prevState?.selection?.trackId ?? null,
            clipId: prevState?.selection?.clipId ?? null,
            clipIds: getSelectionClipIds(prevState?.selection, prevState?.selectedClipId),
          };
        },
      };
    case "selectClip":
      return {
        ...command,
        exec(state) {
          return applySelectionToState(state, {
            trackId: command.trackId,
            clipId: command.clipId ?? null,
            clipIds: command.clipId == null ? [] : [command.clipId],
          });
        },
        invert(nextState, prevState) {
          return {
            type: "setSelection",
            trackId: prevState?.selection?.trackId ?? null,
            clipId: prevState?.selection?.clipId ?? null,
            clipIds: getSelectionClipIds(prevState?.selection, prevState?.selectedClipId),
          };
        },
      };
    case "setPlayhead":
      return {
        ...command,
        exec(state) {
          return {
            ...state,
            playhead: Number.isFinite(command.playhead) ? command.playhead : 0,
          };
        },
        invert(nextState, prevState) {
          return {
            type: "setPlayhead",
            playhead: Number.isFinite(prevState?.playhead) ? prevState.playhead : 0,
          };
        },
      };
    default:
      return command;
  }
}

function normalizeCommand(command) {
  assertCommand(command);
  const normalized = createBuiltInCommand(command);
  if (typeof normalized.exec !== "function") {
    throw new TypeError(`Command "${command.type}" requires exec(state)`);
  }

  return normalized;
}

export function createDispatcher(store) {
  if (!store || typeof store.replace !== "function" || typeof store.state !== "object") {
    throw new TypeError("createDispatcher(store) requires a store with state and replace()");
  }

  const undoStack = [];
  const redoStack = [];

  function apply(command, { historyTarget = null, clearRedo = false } = {}) {
    const normalized = normalizeCommand(command);
    const previousState = cloneValue(store.state);
    const draftState = cloneValue(store.state);
    const result = normalized.exec(draftState);

    if (result === ABORT_COMMAND) {
      return store.state;
    }

    const nextState = result ?? draftState;

    if (!nextState || typeof nextState !== "object") {
      throw new TypeError(`Command "${normalized.type}" must return a state object`);
    }

    store.replace(nextState);

    const shouldTrackHistory = normalized.type !== "setPlayhead";
    if (!shouldTrackHistory || typeof normalized.invert !== "function") {
      if (clearRedo) {
        redoStack.length = 0;
      }
      return store.state;
    }

    const inverse = normalized.invert(store.state, previousState);
    if (!inverse) {
      if (clearRedo) {
        redoStack.length = 0;
      }
      return store.state;
    }

    if (historyTarget) {
      historyTarget.push(inverse);
      return store.state;
    }

    undoStack.push(inverse);
    if (clearRedo) {
      redoStack.length = 0;
    }

    return store.state;
  }

  return {
    dispatch(command) {
      return apply(command, { clearRedo: true });
    },
    undo() {
      if (undoStack.length === 0) {
        return store.state;
      }

      const command = undoStack.pop();
      return apply(command, { historyTarget: redoStack });
    },
    redo() {
      if (redoStack.length === 0) {
        return store.state;
      }

      const command = redoStack.pop();
      return apply(command, { historyTarget: undoStack });
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
  };
}
