const DEFAULT_PROJECT = {
  width: 1920,
  height: 1080,
  aspectRatio: 16 / 9,
};

const DEFAULT_TIMELINE = {
  version: 1,
  duration: 0,
  background: "#000",
  tracks: [],
};

export const store = {
  state: {
    playhead: 0,
    playing: false,
    showSafeArea: false,
    project: { ...DEFAULT_PROJECT },
    timeline: { ...DEFAULT_TIMELINE },
  },
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
  mutate(recipe) {
    if (typeof recipe !== "function") {
      throw new TypeError("store.mutate(recipe) requires a function");
    }

    recipe(this.state);

    for (const listener of this.listeners) {
      listener(this.state);
    }

    return this.state;
  },
};
