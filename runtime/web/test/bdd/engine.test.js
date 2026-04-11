import * as commandsModule from "../../src/commands.js";
import {
  createDispatcher,
  moveClipCommand,
  randomizeParamsCommand,
  setClipFieldCommand,
  setProjectAspectPresetCommand,
} from "../../src/commands.js";
import { registerScene, renderAt, SCENES, validateTimeline } from "../../src/engine/index.js";
import { SCENE_MANIFEST } from "../../src/scenes/index.js";
import { createDefaultTimeline, store } from "../../src/store.js";
import { endScrubbing, setScrubPlayhead, startScrubbing } from "../../src/timeline/scrub.js";
import { BASE_PX_PER_SECOND, createZoomController } from "../../src/timeline/zoom.js";
import { describe, expect, it, skip } from "./runner.js";

const TEST_SCENE_ID = "bdd/mock-frame-pure-scene";

function createBaseState(timeline = createDefaultTimeline()) {
  return {
    playhead: 0,
    playing: false,
    loop: true,
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

function resetGlobalStore(timeline = createDefaultTimeline()) {
  const nextState = createBaseState(timeline);

  store.mutate((state) => {
    state.playhead = nextState.playhead;
    state.playing = nextState.playing;
    state.loop = nextState.loop;
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

function createLocalStore(timeline = createDefaultTimeline()) {
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

function createClip(overrides = {}) {
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

function findTrack(timeline, trackId) {
  const track = timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) {
    throw new Error(`Expected track "${trackId}" to exist in timeline`);
  }

  return track;
}

function cloneTimeline(timeline) {
  return JSON.parse(JSON.stringify(timeline));
}

function createMockContext() {
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

function withTestScene(fn) {
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

describe("BDD critical scenarios", () => {
  it("STORE-01 preview perf overlay defaults to off", () => {
    expect(store.state.showPerf).toBe(false);
  });

  it("STORE-02 playback updates avoid cloning timeline and asset state", () => {
    resetGlobalStore();

    const timelineRef = store.state.timeline;
    const assetsRef = store.state.assets;
    const assetBuffersRef = store.state.assetBuffers;
    let previousState = null;
    const unsubscribe = store.subscribe((nextState, prevState) => {
      previousState = prevState;
      expect(nextState.playhead).toBe(1.5);
      expect(nextState.playing).toBe(true);
      expect(prevState.playhead).toBe(0);
      expect(prevState.playing).toBe(false);
      expect(prevState.timeline).toBe(timelineRef);
      expect(prevState.assets).toBe(assetsRef);
      expect(prevState.assetBuffers).toBe(assetBuffersRef);
    });

    store.updatePlaybackState(1.5, { playing: true });
    unsubscribe();

    expect(Boolean(previousState)).toBe(true);
    expect(previousState === store.state).toBe(false);
  });

  it("STORE-03 aspect preset switching updates project state and supports undo/redo", () => {
    const localStore = createLocalStore();
    const dispatcher = createDispatcher(localStore);

    expect(localStore.state.project.width).toBe(1920);
    expect(localStore.state.project.height).toBe(1080);
    expect(localStore.state.project.aspectRatio).toBe(16 / 9);
    expect(localStore.state.dirty).toBe(false);

    dispatcher.dispatch(setProjectAspectPresetCommand({
      presetId: "tiktok-9-16",
    }));

    expect(localStore.state.project.width).toBe(1080);
    expect(localStore.state.project.height).toBe(1920);
    expect(localStore.state.project.aspectRatio).toBe(9 / 16);
    expect(localStore.state.dirty).toBe(true);

    dispatcher.undo();

    expect(localStore.state.project.width).toBe(1920);
    expect(localStore.state.project.height).toBe(1080);
    expect(localStore.state.project.aspectRatio).toBe(16 / 9);
    expect(localStore.state.dirty).toBe(false);

    dispatcher.redo();

    expect(localStore.state.project.width).toBe(1080);
    expect(localStore.state.project.height).toBe(1920);
    expect(localStore.state.project.aspectRatio).toBe(9 / 16);
    expect(localStore.state.dirty).toBe(true);
  });

  it("TL-01 fresh timeline has 3 default tracks", () => {
    const timeline = createDefaultTimeline();

    if (!Array.isArray(timeline.tracks) || timeline.tracks.length < 3) {
      skip("createDefaultTimeline() does not seed the default V1/V2/A1 tracks yet");
    }

    expect(timeline.duration).toBe(30, "Expected a fresh timeline to default to a 30-second ruler");
    expect(timeline.tracks.length).toBe(3, "Expected a fresh timeline to include exactly V1, V2, and A1");
    expect(timeline.tracks.map((track) => track.label)).toEqual(["V1", "V2", "A1"]);
    expect(timeline.tracks.every((track) => Array.isArray(track.clips) && track.clips.length === 0)).toBeTruthy(
      "Expected all default tracks to be empty",
    );
  });

  it("TL-05 zoom changes pxPerSecond", () => {
    const zoom = createZoomController(1);

    expect(zoom.pxPerSecond).toBe(BASE_PX_PER_SECOND);
    expect(zoom.setZoom(2.5)).toBe(2.5);
    expect(zoom.pxPerSecond).toBe(BASE_PX_PER_SECOND * 2.5);
  });

  it("CLIP-01 addClip on an empty track creates a clip at the requested start", () => {
    resetGlobalStore();

    const clip = createClip({
      id: "clip-add",
      start: 4.2,
      dur: 6,
    });

    store.addClip("v1", clip);

    const track = findTrack(store.state.timeline, "v1");
    expect(track.clips.length).toBe(1, "Expected addClip() to append a single clip to V1");
    expect(track.clips[0].id).toBe("clip-add");
    expect(track.clips[0].start).toBe(4.2);
    expect(track.clips[0].dur).toBe(6);
  });

  it("CLIP-02 moveClip updates the clip start time", () => {
    const timeline = createDefaultTimeline();
    findTrack(timeline, "v1").clips.push(
      createClip({
        id: "clip-move",
        start: 1.5,
        dur: 3,
      }),
    );

    const localStore = createLocalStore(timeline);
    const dispatcher = createDispatcher(localStore);

    dispatcher.dispatch(
      moveClipCommand({
        clipId: "clip-move",
        newStart: 7.3,
      }),
    );

    const movedClip = findTrack(localStore.state.timeline, "v1").clips.find((clip) => clip.id === "clip-move");
    expect(Boolean(movedClip)).toBeTruthy("Expected moveClipCommand() to keep the moved clip in the timeline");
    expect(movedClip.start).toBe(7.3);
  });

  it("CLIP-03 setClipField updates top-level clip label and note with undo", () => {
    const timeline = createDefaultTimeline();
    findTrack(timeline, "v1").clips.push(
      createClip({
        id: "clip-meta",
      }),
    );

    const localStore = createLocalStore(timeline);
    const dispatcher = createDispatcher(localStore);

    dispatcher.dispatch(setClipFieldCommand({
      clipId: "clip-meta",
      field: "label",
      value: "blue",
    }));
    dispatcher.dispatch(setClipFieldCommand({
      clipId: "clip-meta",
      field: "note",
      value: "Needs cleanup",
    }));

    let clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-meta");
    expect(clip.label).toBe("blue");
    expect(clip.note).toBe("Needs cleanup");

    dispatcher.undo();
    clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-meta");
    expect(Object.prototype.hasOwnProperty.call(clip, "note")).toBe(false);
    expect(clip.label).toBe("blue");

    dispatcher.undo();
    clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-meta");
    expect(Object.prototype.hasOwnProperty.call(clip, "label")).toBe(false);

    dispatcher.redo();
    dispatcher.redo();
    clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-meta");
    expect(clip.label).toBe("blue");
    expect(clip.note).toBe("Needs cleanup");
  });

  it("CLIP-04 randomizeParams updates scene params with undo", () => {
    const timeline = createDefaultTimeline();
    findTrack(timeline, "v1").clips.push(
      createClip({
        id: "clip-randomize",
        params: {
          color: "#ff3300",
          hue: 120,
          title: "Original",
        },
      }),
    );

    const localStore = createLocalStore(timeline);
    const dispatcher = createDispatcher(localStore);
    const randomizedParams = {
      color: "#00ffaa",
      hue: 288.42,
      title: "Original",
    };

    dispatcher.dispatch(randomizeParamsCommand({
      clipId: "clip-randomize",
      newParams: randomizedParams,
    }));

    let clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-randomize");
    expect(clip.params).toEqual(randomizedParams);

    dispatcher.undo();
    clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-randomize");
    expect(clip.params).toEqual({
      color: "#ff3300",
      hue: 120,
      title: "Original",
    });

    dispatcher.redo();
    clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-randomize");
    expect(clip.params).toEqual(randomizedParams);
  });

  it("CLIP-05 splitClip produces two clips", () => {
    if (typeof commandsModule.splitClipCommand !== "function") {
      skip("splitClipCommand() is not implemented in runtime/web/src/commands.js");
    }

    const timeline = createDefaultTimeline();
    findTrack(timeline, "v1").clips.push(
      createClip({
        id: "clip-split",
        start: 1,
        dur: 6,
      }),
    );

    const localStore = createLocalStore(timeline);
    const dispatcher = createDispatcher(localStore);

    dispatcher.dispatch(
      commandsModule.splitClipCommand({
        clipId: "clip-split",
        splitTime: 3.5,
      }),
    );

    expect(findTrack(localStore.state.timeline, "v1").clips.length).toBe(
      2,
      "Expected splitClipCommand() to replace one clip with two resulting segments",
    );
  });

  it("SCRUB-01 store.playhead mutations notify subscribers", () => {
    resetGlobalStore();

    let callCount = 0;
    let transition = null;
    const unsubscribe = store.subscribe((nextState, previousState) => {
      if (nextState.playhead === 5 && previousState.playhead !== 5) {
        callCount += 1;
        transition = {
          previous: previousState.playhead,
          next: nextState.playhead,
        };
      }
    });

    try {
      store.mutate((state) => {
        state.playhead = 5;
      });
    } finally {
      unsubscribe();
    }

    expect(callCount).toBe(1, "Expected changing store.state.playhead to trigger one subscriber notification");
    expect(transition).toEqual({ previous: 0, next: 5 });
  });

  it("SCRUB-03 renderAt at t=5 matches rendering t=2 then t=5", () => {
    withTestScene(() => {
      const timeline = createDefaultTimeline();
      findTrack(timeline, "v1").clips.push(
        createClip({
          id: "clip-render",
          start: 0,
          dur: 10,
        }),
      );

      const directContext = createMockContext();
      const replayContext = createMockContext();

      renderAt(directContext, timeline, 5);
      renderAt(replayContext, timeline, 2);
      replayContext.resetLog();
      renderAt(replayContext, timeline, 5);

      expect(replayContext.operations).toEqual(
        directContext.operations,
        "Expected renderAt() to be frame-pure for equivalent final times",
      );
    });
  });

  it("SCRUB-02 throttles scrub playhead mutations and flushes the final value on end", () => {
    const localStore = createLocalStore();
    const dispatcher = createDispatcher(localStore);
    localStore.dispatch = (command) => dispatcher.dispatch(command);

    let onEndCalls = 0;
    let playheadNotifications = 0;
    const seenPlayheads = [];
    const unsubscribe = localStore.subscribe((nextState, previousState) => {
      if (nextState.playhead === previousState.playhead) {
        return;
      }

      playheadNotifications += 1;
      seenPlayheads.push(nextState.playhead);
    });

    try {
      startScrubbing(localStore, {
        onEnd() {
          onEndCalls += 1;
        },
      });

      expect(localStore.state.scrubbing).toBe(true, "Expected startScrubbing() to set store.state.scrubbing");

      setScrubPlayhead(localStore, 1);
      setScrubPlayhead(localStore, 2);
      setScrubPlayhead(localStore, 3);

      expect(playheadNotifications).toBe(
        1,
        "Expected scrub playhead changes inside one throttle window to notify subscribers once immediately",
      );

      endScrubbing(localStore);
    } finally {
      unsubscribe();
    }

    expect(localStore.state.scrubbing).toBe(false, "Expected endScrubbing() to clear store.state.scrubbing");
    expect(localStore.state.playhead).toBe(3, "Expected endScrubbing() to flush the final pending playhead");
    expect(playheadNotifications).toBe(2, "Expected endScrubbing() to emit one final playhead mutation");
    expect(seenPlayheads).toEqual([1, 3]);
    expect(onEndCalls).toBe(1, "Expected endScrubbing() to call the provided onEnd callback once");
  });

  it("UNDO-01 dispatch then undo restores the previous timeline state", () => {
    const timeline = createDefaultTimeline();
    findTrack(timeline, "v1").clips.push(
      createClip({
        id: "clip-undo",
        start: 1,
        dur: 2,
      }),
    );

    const localStore = createLocalStore(timeline);
    const dispatcher = createDispatcher(localStore);
    const initialTimeline = cloneTimeline(localStore.state.timeline);

    dispatcher.dispatch(
      moveClipCommand({
        clipId: "clip-undo",
        newStart: 4.4,
      }),
    );

    dispatcher.undo();

    expect(localStore.state.timeline).toEqual(
      initialTimeline,
      "Expected undo() to restore the exact timeline state from before the dispatch",
    );
  });

  it("FILE-03 validateTimeline rejects malformed timelines and accepts valid ones", () => {
    const validTimeline = createDefaultTimeline();
    const validResult = validateTimeline(validTimeline);
    expect(validResult).toEqual({ ok: true, errors: [] });

    const invalidResult = validateTimeline({
      version: 1,
      duration: -1,
      tracks: [
        {
          id: "",
          kind: "",
          clips: [
            {
              id: "",
              start: -2,
              dur: 0,
            },
          ],
        },
      ],
    });

    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
    expect(
      invalidResult.errors.some((error) => error.includes("timeline.duration"))
        && invalidResult.errors.some((error) => error.includes("scene or assetId")),
    ).toBeTruthy("Expected validateTimeline() to report both structural and clip payload errors");
  });

  it("INS-02 SCENE_MANIFEST exposes 11 scenes with parameter schemas", () => {
    expect(SCENE_MANIFEST.length).toBe(11, "Expected the built-in scene manifest to list eleven built-in scenes");
    expect(
      SCENE_MANIFEST.every((scene) => {
        if (!scene || typeof scene.id !== "string" || typeof scene.name !== "string") {
          return false;
        }

        const params = scene.params;
        return params
          && typeof params === "object"
          && Object.keys(params).length > 0
          && Object.values(params).every((param) => {
            return param
              && typeof param.type === "string"
              && Object.prototype.hasOwnProperty.call(param, "default");
          });
      }),
    ).toBeTruthy("Expected every scene manifest entry to include a typed params schema with defaults");
  });
});
