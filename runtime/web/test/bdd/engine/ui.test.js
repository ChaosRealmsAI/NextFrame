import { createTrackRow } from "../../../src/timeline/track.js";
import { attachClipInteractions } from "../../../src/timeline/clip-interact.js";
import { createDefaultTimeline } from "../../../src/store.js";
import { createZoomController } from "../../../src/timeline/zoom.js";
import { describe, expect, it, skip } from "../runner.js";
import { createBaseState, createClip } from "./helpers.js";

describe("BDD critical scenarios", () => {
  it("UI-01 track header buttons dispatch undoable track flag commands", () => {
    if (typeof document === "undefined") {
      skip("Track header interaction test requires a DOM environment");
    }

    const dispatched = [];
    const row = createTrackRow({
      id: "v1",
      label: "V1",
      name: "Video 1",
      kind: "video",
      muted: false,
      solo: false,
      locked: false,
      clips: [],
    }, {
      duration: 10,
      zoom: {
        pxPerSecond: 20,
        timeToPx: (time) => time * 20,
        pxToTime: (pixels) => pixels / 20,
      },
      store: {
        state: {
          assets: [],
          assetBuffers: new Map(),
        },
        dispatch(command) {
          dispatched.push(command);
        },
      },
    });

    row.querySelector('[data-flag="solo"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(dispatched).toEqual([{
      type: "setTrackFlag",
      trackId: "v1",
      flag: "solo",
      value: true,
    }]);
  });

  it("UI-02 locked tracks ignore clip mousedown interactions", () => {
    if (typeof document === "undefined") {
      skip("Clip interaction guard test requires a DOM environment");
    }

    const clipEl = document.createElement("div");
    const clip = createClip({ id: "clip-locked" });
    const track = {
      id: "v1",
      kind: "video",
      muted: false,
      solo: false,
      locked: true,
      clips: [clip],
    };
    const storeSelectionCalls = [];
    const localStore = {
      state: {
        ...createBaseState({
          ...createDefaultTimeline(),
          tracks: [track],
        }),
      },
      dispatch() {
        throw new Error("Locked clip interaction should not dispatch commands");
      },
      selectClip(clipId) {
        storeSelectionCalls.push(clipId);
      },
      addToSelection(clipId) {
        storeSelectionCalls.push(clipId);
      },
    };

    attachClipInteractions(clipEl, clip.id, localStore, createZoomController(1));
    clipEl.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }));

    expect(storeSelectionCalls.length).toBe(0);
  });
});
