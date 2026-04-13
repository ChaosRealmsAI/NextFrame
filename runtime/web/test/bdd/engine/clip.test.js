import * as commandsModule from "../../../src/commands.js";
import {
  createDispatcher,
  moveClipCommand,
  randomizeParamsCommand,
  setClipFieldCommand,
  setClipParamCommand,
} from "../../../src/commands.js";
import { createDefaultTimeline, store } from "../../../src/store.js";
import { describe, expect, it, skip } from "../runner.js";
import { cloneTimeline, createClip, createLocalStore, findTrack, resetGlobalStore } from "./helpers.js";

describe("BDD critical scenarios", () => {
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

  it("CLIP-04A setClipParam updates nested params with undo", () => {
    const timeline = createDefaultTimeline();
    findTrack(timeline, "v1").clips.push(
      createClip({
        id: "clip-keyframed-param",
        params: {
          opacity: 0.3,
        },
      }),
    );

    const localStore = createLocalStore(timeline);
    const dispatcher = createDispatcher(localStore);
    const keyframedOpacity = {
      type: "keyframes",
      keyframes: [
        { time: 0, value: 0.3, ease: "linear" },
        { time: 2, value: 0.8, ease: "linear" },
      ],
    };

    dispatcher.dispatch(setClipParamCommand({
      clipId: "clip-keyframed-param",
      param: "opacity",
      value: keyframedOpacity,
    }));

    let clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-keyframed-param");
    expect(clip.params.opacity).toEqual(keyframedOpacity);

    dispatcher.undo();
    clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-keyframed-param");
    expect(clip.params.opacity).toBe(0.3);

    dispatcher.redo();
    clip = findTrack(localStore.state.timeline, "v1").clips.find((candidate) => candidate.id === "clip-keyframed-param");
    expect(clip.params.opacity).toEqual(keyframedOpacity);
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
});
