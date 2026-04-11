import { createDispatcher } from "./commands.js";

const DEFAULT_PROJECT = {
  width: 1920,
  height: 1080,
  aspectRatio: 16 / 9,
};

export function createDefaultTimeline() {
  return {
    version: "1",
    duration: 30,
    background: "#0b0b14",
    tracks: [],
  };
}

function createInitialState() {
  return {
    playhead: 0,
    playing: true,
    showSafeArea: false,
    project: { ...DEFAULT_PROJECT },
    timeline: createDefaultTimeline(),
    filePath: null,
    dirty: false,
    selectedClipId: null,
    searchQuery: "",
    assets: [],
    selection: {
      trackId: null,
      clipId: null,
    },
    ui: {
      zoom: 1,
      timelineVisible: true,
      inspectorVisible: true,
    },
  };
}

function cloneState(state) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(state);
  }

  return JSON.parse(JSON.stringify(state));
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
