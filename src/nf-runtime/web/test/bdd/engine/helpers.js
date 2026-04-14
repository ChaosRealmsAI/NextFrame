import { registerScene, SCENES } from "../../../src/engine/index.js";
import { DEFAULT_LOOP_REGION } from "../../../src/loop-region.js";
import { createDefaultTimeline, store } from "../../../src/store.js";

export const TEST_SCENE_ID = "bdd/mock-frame-pure-scene";

export function createBaseState(timeline = createDefaultTimeline()) {
  return {
    playhead: 0,
    playing: false,
    loop: false,
    loopRegion: {
      ...DEFAULT_LOOP_REGION,
    },
    scrubbing: false,
    snapEnabled: true,
    showSafeArea: false,
    showPerf: false,
    project: {
      width: 1920,
      height: 1080,
      aspectRatio: 16 / 9,
    },
    timeline,
    filePath: null,
    dirty: false,
    selectedClipId: null,
    searchQuery: "",
    assets: [],
    assetBuffers: new Map(),
    selection: {
      trackId: null,
      clipId: null,
      clipIds: [],
    },
    ui: {
      zoom: 1,
      timelineVisible: true,
      inspectorVisible: true,
      timelineTool: "select",
    },
  };
}

export function resetGlobalStore(timeline = createDefaultTimeline()) {
  const nextState = createBaseState(timeline);

  store.mutate((state) => {
    state.playhead = nextState.playhead;
    state.playing = nextState.playing;
    state.loop = nextState.loop;
    state.loopRegion = nextState.loopRegion;
    state.scrubbing = nextState.scrubbing;
    state.snapEnabled = nextState.snapEnabled;
    state.showSafeArea = nextState.showSafeArea;
    state.showPerf = nextState.showPerf;
    state.project = nextState.project;
    state.timeline = nextState.timeline;
    state.filePath = nextState.filePath;
    state.dirty = nextState.dirty;
    state.selectedClipId = nextState.selectedClipId;
    state.searchQuery = nextState.searchQuery;
    state.assets = nextState.assets;
    state.assetBuffers = nextState.assetBuffers;
    state.selection = nextState.selection;
    state.ui = nextState.ui;
  });
}

export function createLocalStore(timeline = createDefaultTimeline()) {
  return {
    state: createBaseState(timeline),
    listeners: new Set(),
    replace(nextState) {
      const previousState = structuredClone(this.state);
      this.state = nextState;

      for (const listener of this.listeners) {
        listener(this.state, previousState);
      }

      return this.state;
    },
    mutate(recipe) {
      const previousState = structuredClone(this.state);
      recipe(this.state);

      for (const listener of this.listeners) {
        listener(this.state, previousState);
      }

      return this.state;
    },
    subscribe(listener) {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    },
  };
}

export function createClip(overrides = {}) {
  return {
    id: "clip-1",
    start: 0,
    dur: 4,
    scene: TEST_SCENE_ID,
    params: {
      color: "#ff3300",
    },
    ...overrides,
  };
}

export function findTrack(timeline, trackId) {
  const track = timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) {
    throw new Error(`Expected track "${trackId}" to exist in timeline`);
  }

  return track;
}

export function cloneTimeline(timeline) {
  return JSON.parse(JSON.stringify(timeline));
}

export function createMockContext() {
  const operations = [];
  let fillStyle = null;
  let globalAlpha = 1;
  let globalCompositeOperation = "source-over";

  return {
    canvas: {
      width: 320,
      height: 180,
    },
    operations,
    resetLog() {
      operations.length = 0;
    },
    save() {
      operations.push(["save"]);
    },
    restore() {
      operations.push(["restore"]);
    },
    setTransform(...args) {
      operations.push(["setTransform", ...args]);
    },
    clearRect(...args) {
      operations.push(["clearRect", ...args]);
    },
    fillRect(...args) {
      operations.push(["fillRect", fillStyle, ...args]);
    },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value) {
      fillStyle = value;
      operations.push(["fillStyle", value]);
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value) {
      globalAlpha = value;
      operations.push(["globalAlpha", value]);
    },
    get globalCompositeOperation() {
      return globalCompositeOperation;
    },
    set globalCompositeOperation(value) {
      globalCompositeOperation = value;
      operations.push(["globalCompositeOperation", value]);
    },
  };
}

export function withTestScene(fn) {
  const previousScene = SCENES.get(TEST_SCENE_ID);

  registerScene(TEST_SCENE_ID, (localT, params, ctx) => {
    ctx.fillStyle = params.color;
    ctx.fillRect(Math.round(localT * 10), 12, 16, 16);
  });

  try {
    fn();
  } finally {
    if (previousScene) {
      SCENES.set(TEST_SCENE_ID, previousScene);
    } else {
      SCENES.delete(TEST_SCENE_ID);
    }
  }
}

export function createMockAudioBuffer(duration = 2) {
  return {
    duration,
    numberOfChannels: 1,
    getChannelData() {
      return new Float32Array(1);
    },
  };
}

export function createMockAudioContext() {
  const starts = [];

  return {
    currentTime: 24,
    state: "running",
    destination: {},
    starts,
    resume() {
      return Promise.resolve();
    },
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        disconnect() {},
        addEventListener() {},
        start(when, clipStart, clipDur) {
          starts.push({ when, clipStart, clipDur, buffer: this.buffer });
        },
        stop() {},
      };
    },
  };
}
