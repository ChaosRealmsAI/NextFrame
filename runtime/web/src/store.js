import { createDispatcher } from "./commands.js";

const TUTORIAL_COMPLETE_STORAGE_KEY = "nextframe.tutorial.complete";

const DEFAULT_PROJECT = {
  width: 1920,
  height: 1080,
  aspectRatio: 16 / 9,
};

function getLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {}

  return null;
}

function readTutorialComplete() {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(TUTORIAL_COMPLETE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeTutorialComplete(value) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(TUTORIAL_COMPLETE_STORAGE_KEY, value ? "true" : "false");
  } catch {}
}

export function createDefaultTimeline() {
  return {
    version: "1",
    duration: 30,
    background: "#0b0b14",
    assets: [],
    tracks: [
      { id: "v1", label: "V1", name: "Video 1", kind: "video", clips: [] },
      { id: "v2", label: "V2", name: "Video 2", kind: "video", clips: [] },
      { id: "a1", label: "A1", name: "Audio 1", kind: "audio", clips: [] },
    ],
  };
}

function createInitialState() {
  return {
    playhead: 0,
    playing: true,
    loop: true,
    scrubbing: false,
    snapEnabled: true,
    showSafeArea: false,
    showPerf: false,
    project: { ...DEFAULT_PROJECT },
    timeline: createDefaultTimeline(),
    filePath: null,
    dirty: false,
    selectedClipId: null,
    searchQuery: "",
    favorites: [],
    assets: [],
    assetBuffers: new Map(),
    selection: {
      trackId: null,
      clipId: null,
      clipIds: [],
    },
    tutorialComplete: readTutorialComplete(),
    ui: {
      zoom: 1,
      timelineVisible: true,
      inspectorVisible: true,
      timelineTool: "select",
    },
  };
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

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

function cloneState(state) {
  return cloneValue(state);
}

function cloneTopLevelState(state) {
  return {
    ...state,
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

function findTrackIdByClipId(timeline, clipId) {
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];

  for (const track of tracks) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    if (clips.some((clip) => clip?.id === clipId)) {
      return track.id ?? null;
    }
  }

  return null;
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

function getFavoriteSceneIds(state) {
  const ids = [];
  const seen = new Set();

  (Array.isArray(state?.favorites) ? state.favorites : []).forEach((sceneId) => {
    if (sceneId == null) {
      return;
    }

    const normalized = String(sceneId);
    if (normalized.length === 0 || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    ids.push(normalized);
  });

  return ids;
}

function getSelectionClipIds(state) {
  const clipIds = uniqueClipIds(state?.selection?.clipIds);
  const selectedClipId = state?.selectedClipId == null ? null : String(state.selectedClipId);

  if (selectedClipId && !clipIds.includes(selectedClipId)) {
    clipIds.push(selectedClipId);
  }

  return clipIds;
}

function resolveSelectionState(state, payload = {}) {
  const clipIds = uniqueClipIds(payload.clipIds ?? (payload.clipId != null ? [payload.clipId] : []))
    .filter((clipId) => Boolean(findTrackIdByClipId(state?.timeline, clipId)));
  const preferredClipId = payload.clipId == null ? null : String(payload.clipId);
  const clipId = preferredClipId && clipIds.includes(preferredClipId)
    ? preferredClipId
    : clipIds.at(-1) ?? null;

  let trackId;
  if (Object.prototype.hasOwnProperty.call(payload, "trackId") && payload.trackId !== undefined) {
    trackId = payload.trackId == null ? null : String(payload.trackId);
  } else if (clipId) {
    trackId = findTrackIdByClipId(state?.timeline, clipId);
  } else {
    trackId = state?.selection?.trackId ?? null;
  }

  return {
    selectedClipId: clipId,
    selection: {
      trackId,
      clipId,
      clipIds,
    },
  };
}

export const store = {
  state: createInitialState(),
  listeners: new Set(),
  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("store.subscribe(listener) requires a function");
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  },
  replace(nextState) {
    if (!nextState || typeof nextState !== "object") {
      throw new TypeError("store.replace(nextState) requires a state object");
    }

    const previousState = cloneState(this.state);
    const previousDirty = this.state.dirty;
    const previousTimeline = this.state.timeline;
    let resolvedState = nextState;

    if (resolvedState.timeline !== previousTimeline && resolvedState.dirty === previousDirty) {
      resolvedState = {
        ...resolvedState,
        dirty: true,
      };
    }

    const normalizedFavorites = getFavoriteSceneIds(resolvedState);
    if (resolvedState.favorites !== normalizedFavorites) {
      resolvedState = {
        ...resolvedState,
        favorites: normalizedFavorites,
      };
    }

    this.state = resolvedState;

    for (const listener of this.listeners) {
      listener(this.state, previousState);
    }

    return this.state;
  },
  mutate(recipe) {
    if (typeof recipe !== "function") {
      throw new TypeError("store.mutate(recipe) requires a function");
    }

    const previousState = cloneState(this.state);
    const prevDirty = this.state.dirty;
    const prevTimeline = this.state.timeline;
    let dirtyAssigned = false;
    const proxy = new Proxy(this.state, {
      get(target, prop, receiver) {
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (prop === "dirty") {
          dirtyAssigned = true;
        }

        return Reflect.set(target, prop, value, receiver);
      },
    });

    recipe(proxy);

    if (!dirtyAssigned && this.state.timeline !== prevTimeline && this.state.dirty === prevDirty) {
      this.state.dirty = true;
    }

    for (const listener of this.listeners) {
      listener(this.state, previousState);
    }

    return this.state;
  },
  updatePlaybackState(playhead, { playing = this.state.playing } = {}) {
    const nextPlayhead = typeof playhead === "number" && Number.isFinite(playhead) ? playhead : 0;
    const nextPlaying = Boolean(playing);

    if (nextPlayhead === this.state.playhead && nextPlaying === this.state.playing) {
      return this.state;
    }

    const previousState = cloneTopLevelState(this.state);
    this.state.playhead = nextPlayhead;
    this.state.playing = nextPlaying;

    for (const listener of this.listeners) {
      listener(this.state, previousState);
    }

    return this.state;
  },
  addClip(trackId, clip) {
    if (typeof trackId !== "string" || trackId.length === 0) {
      throw new TypeError("store.addClip(trackId, clip) requires a non-empty track id");
    }

    if (!clip || typeof clip !== "object") {
      throw new TypeError("store.addClip(trackId, clip) requires a clip object");
    }

    const timeline = this.state.timeline || createDefaultTimeline();
    const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
    const trackIndex = tracks.findIndex((track) => track?.id === trackId);
    if (trackIndex < 0) {
      throw new Error(`store.addClip(trackId, clip) could not find track "${trackId}"`);
    }

    const nextTracks = tracks.map((track, index) => {
      if (index !== trackIndex) {
        return track;
      }

      return {
        ...track,
        clips: sortClips([...(Array.isArray(track?.clips) ? track.clips : []), cloneValue(clip)]),
      };
    });

    return this.replace({
      ...this.state,
      timeline: {
        ...timeline,
        tracks: nextTracks,
      },
    });
  },
  selectClip(clipId) {
    const nextClipId = clipId == null ? null : String(clipId);
    const nextSelection = resolveSelectionState(this.state, {
      clipId: nextClipId,
      clipIds: nextClipId ? [nextClipId] : [],
    });

    return this.replace({
      ...this.state,
      ...nextSelection,
    });
  },
  selectClips(clipIds, { clipId = null, trackId } = {}) {
    const nextSelection = resolveSelectionState(this.state, {
      trackId,
      clipId,
      clipIds,
    });

    return this.replace({
      ...this.state,
      ...nextSelection,
    });
  },
  addToSelection(clipId) {
    const nextClipId = clipId == null ? null : String(clipId);
    if (!nextClipId) {
      return this.state;
    }

    const nextSelection = resolveSelectionState(this.state, {
      clipId: nextClipId,
      clipIds: [...getSelectionClipIds(this.state), nextClipId],
    });

    return this.replace({
      ...this.state,
      ...nextSelection,
    });
  },
  clearSelection({ trackId } = {}) {
    const nextSelection = resolveSelectionState(this.state, {
      trackId,
      clipId: null,
      clipIds: [],
    });

    return this.replace({
      ...this.state,
      ...nextSelection,
    });
  },
  setTimelineTool(tool) {
    const nextTool = tool === "blade" ? "blade" : "select";
    if (this.state.ui?.timelineTool === nextTool) {
      return this.state;
    }

    return this.replace({
      ...this.state,
      ui: {
        ...this.state.ui,
        timelineTool: nextTool,
      },
    });
  },
  toggleFavorite(sceneId) {
    const nextSceneId = sceneId == null ? "" : String(sceneId);
    if (nextSceneId.length === 0) {
      throw new TypeError("store.toggleFavorite(sceneId) requires a non-empty scene id");
    }

    const favorites = getFavoriteSceneIds(this.state);
    const nextFavorites = favorites.includes(nextSceneId)
      ? favorites.filter((favoriteId) => favoriteId !== nextSceneId)
      : [...favorites, nextSceneId];

    return this.replace({
      ...this.state,
      favorites: nextFavorites,
    });
  },
  isFavorite(sceneId) {
    const nextSceneId = sceneId == null ? "" : String(sceneId);
    if (nextSceneId.length === 0) {
      return false;
    }

    return getFavoriteSceneIds(this.state).includes(nextSceneId);
  },
};

const dispatcher = createDispatcher(store);

store.dispatch = (command) => dispatcher.dispatch(command);
store.undo = () => dispatcher.undo();
store.redo = () => dispatcher.redo();

Object.defineProperties(store, {
  canUndo: {
    enumerable: true,
    get() {
      return dispatcher.canUndo;
    },
  },
  canRedo: {
    enumerable: true,
    get() {
      return dispatcher.canRedo;
    },
  },
});

let lastTutorialComplete = Boolean(store.state.tutorialComplete);

store.subscribe((state) => {
  const nextTutorialComplete = Boolean(state?.tutorialComplete);
  if (nextTutorialComplete === lastTutorialComplete) {
    return;
  }

  lastTutorialComplete = nextTutorialComplete;
  writeTutorialComplete(nextTutorialComplete);
});
