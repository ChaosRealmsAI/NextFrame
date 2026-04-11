function cloneValue(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

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

function createBuiltInCommand(command) {
  switch (command.type) {
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

          const selection = state.selection?.clipId === command.clipId
            ? { trackId: null, clipId: null }
            : state.selection;

          return {
            ...withUpdatedTimeline(state, tracks),
            selection,
          };
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

          const selection = state.selection?.clipId === command.clipId
            ? { trackId: targetTrackId, clipId: command.clipId }
            : state.selection;

          return {
            ...withUpdatedTimeline(state, tracks),
            selection,
          };
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
    case "selectClip":
      return {
        ...command,
        exec(state) {
          return {
            ...state,
            selection: {
              trackId: command.trackId ?? null,
              clipId: command.clipId ?? null,
            },
          };
        },
        invert(nextState, prevState) {
          return {
            type: "selectClip",
            trackId: prevState?.selection?.trackId ?? null,
            clipId: prevState?.selection?.clipId ?? null,
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
    const nextState = normalized.exec(draftState) ?? draftState;

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
