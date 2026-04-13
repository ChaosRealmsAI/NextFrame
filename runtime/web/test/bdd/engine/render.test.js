import { evalParam, renderAt } from "../../../src/engine/index.js";
import { createDefaultTimeline } from "../../../src/store.js";
import { describe, expect, it } from "../runner.js";
import { createClip, createMockContext, findTrack, withTestScene } from "./helpers.js";

describe("BDD critical scenarios", () => {
  it("ENGINE-01 evalParam returns literals unchanged and linearly interpolates keyframes", () => {
    expect(evalParam(0.5, 1.25)).toBe(0.5);
    expect(evalParam({
      type: "keyframes",
      keyframes: [
        { time: 0, value: 0.3, ease: "linear" },
        { time: 2, value: 0.7, ease: "linear" },
      ],
    }, -1)).toBe(0.3);
    expect(evalParam({
      type: "keyframes",
      keyframes: [
        { time: 0, value: 0.3, ease: "linear" },
        { time: 2, value: 0.7, ease: "linear" },
      ],
    }, 1)).toBe(0.5);
    expect(evalParam({
      type: "keyframes",
      keyframes: [
        { time: 0, value: 0.3, ease: "linear" },
        { time: 2, value: 0.7, ease: "linear" },
      ],
    }, 4)).toBe(0.7);
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

  it("SCRUB-04 renderAt skips muted tracks and only renders solo tracks when any solo is active", () => {
    withTestScene(() => {
      const timeline = {
        ...createDefaultTimeline(),
        tracks: [
          {
            id: "v1",
            kind: "video",
            muted: true,
            solo: false,
            locked: false,
            clips: [createClip({ id: "clip-muted", params: { color: "#ff0000" } })],
          },
          {
            id: "v2",
            kind: "video",
            muted: false,
            solo: true,
            locked: false,
            clips: [createClip({ id: "clip-solo", params: { color: "#00ff00" } })],
          },
          {
            id: "v3",
            kind: "video",
            muted: false,
            solo: false,
            locked: false,
            clips: [createClip({ id: "clip-hidden", params: { color: "#0000ff" } })],
          },
        ],
      };
      const ctx = createMockContext();

      renderAt(ctx, timeline, 1);

      const renderedColors = ctx.operations
        .filter((entry) => entry[0] === "fillStyle" && entry[1] !== "#0b0b14")
        .map((entry) => entry[1]);
      expect(renderedColors).toEqual(["#00ff00"]);
    });
  });
});
