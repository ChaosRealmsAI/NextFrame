import { createMixer } from "../../../src/audio/mixer.js";
import { createDefaultTimeline } from "../../../src/store.js";
import { describe, expect, it } from "../runner.js";
import { createBaseState, createMockAudioBuffer, createMockAudioContext } from "./helpers.js";

describe("BDD critical scenarios", () => {
  it("AUDIO-01 mixer skips muted tracks and respects solo-only playback", () => {
    const audioContext = createMockAudioContext();
    const audioBuffer = createMockAudioBuffer(4);
    const timeline = {
      ...createDefaultTimeline(),
      duration: 4,
      tracks: [
        {
          id: "a1",
          kind: "audio",
          muted: true,
          solo: false,
          locked: false,
          clips: [{
            id: "clip-muted-audio",
            start: 0,
            dur: 2,
            assetId: "tone-a",
            scene: "audio",
            params: {},
          }],
        },
        {
          id: "a2",
          kind: "audio",
          muted: false,
          solo: true,
          locked: false,
          clips: [{
            id: "clip-solo-audio",
            start: 0,
            dur: 2,
            assetId: "tone-b",
            scene: "audio",
            params: {},
          }],
        },
        {
          id: "a3",
          kind: "audio",
          muted: false,
          solo: false,
          locked: false,
          clips: [{
            id: "clip-non-solo-audio",
            start: 0,
            dur: 2,
            assetId: "tone-c",
            scene: "audio",
            params: {},
          }],
        },
      ],
      assets: [
        { id: "tone-a", kind: "audio", path: "file:///tone-a.wav" },
        { id: "tone-b", kind: "audio", path: "file:///tone-b.wav" },
        { id: "tone-c", kind: "audio", path: "file:///tone-c.wav" },
      ],
    };
    const state = createBaseState(timeline);
    state.loop = false;
    state.assets = timeline.assets;
    state.assetBuffers = new Map([
      ["file:///tone-a.wav", audioBuffer],
      ["file:///tone-b.wav", audioBuffer],
      ["file:///tone-c.wav", audioBuffer],
    ]);

    const mixer = createMixer({
      audioContext,
      getState: () => state,
    });

    mixer.syncToPlayhead(0, true);

    expect(audioContext.starts.length).toBe(1);
    expect(audioContext.starts[0].buffer).toBe(audioBuffer);
  });
});
