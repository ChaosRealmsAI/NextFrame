import { createDispatcher, setProjectAspectPresetCommand } from "../../../src/commands.js";
import { store } from "../../../src/store.js";
import { describe, expect, it } from "../runner.js";
import { createLocalStore, resetGlobalStore } from "./helpers.js";

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
});
