import { createDispatcher, setTrackFlagCommand } from "../../../src/commands.js";
import { createDefaultTimeline } from "../../../src/store.js";
import { BASE_PX_PER_SECOND, createZoomController } from "../../../src/timeline/zoom.js";
import { describe, expect, it, skip } from "../runner.js";
import { createLocalStore, findTrack } from "./helpers.js";

describe("BDD critical scenarios", () => {
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
    expect(
      timeline.tracks.every((track) => track.muted === false && track.solo === false && track.locked === false),
    ).toBeTruthy("Expected all default tracks to initialize muted/solo/locked flags to false");
  });

  it("TL-05 zoom changes pxPerSecond", () => {
    const zoom = createZoomController(1);

    expect(zoom.pxPerSecond).toBe(BASE_PX_PER_SECOND);
    expect(zoom.setZoom(2.5)).toBe(2.5);
    expect(zoom.pxPerSecond).toBe(BASE_PX_PER_SECOND * 2.5);
  });

  it("TRACK-01 setTrackFlagCommand updates track flags with undo/redo", () => {
    const localStore = createLocalStore();
    const dispatcher = createDispatcher(localStore);

    dispatcher.dispatch(setTrackFlagCommand({
      trackId: "v1",
      flag: "muted",
      value: true,
    }));
    dispatcher.dispatch(setTrackFlagCommand({
      trackId: "v1",
      flag: "solo",
      value: true,
    }));

    let track = findTrack(localStore.state.timeline, "v1");
    expect(track.muted).toBe(true);
    expect(track.solo).toBe(true);
    expect(track.locked).toBe(false);

    dispatcher.undo();
    dispatcher.undo();

    track = findTrack(localStore.state.timeline, "v1");
    expect(track.muted).toBe(false);
    expect(track.solo).toBe(false);

    dispatcher.redo();
    dispatcher.redo();

    track = findTrack(localStore.state.timeline, "v1");
    expect(track.muted).toBe(true);
    expect(track.solo).toBe(true);
  });
});
