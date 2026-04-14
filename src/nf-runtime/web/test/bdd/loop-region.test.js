import { normalizeLoopRegion, updateLoopRegion } from "../../src/loop-region.js";
import { advancePlaybackTime } from "../../src/preview/loop.js";
import { mountLoopRegion } from "../../src/timeline/loop-region.js";
import { describe, expect, it, skip } from "./runner.js";

describe("Loop region", () => {
  it("LOOP-01 normalizes default and clamped loop region values", () => {
    expect(normalizeLoopRegion(null)).toEqual({
      in: 0,
      out: 30,
      enabled: false,
    });

    expect(normalizeLoopRegion({
      in: 12,
      out: 8,
      enabled: 1,
    }, {
      duration: 10,
    })).toEqual({
      in: 10,
      out: 10,
      enabled: true,
    });
  });

  it("LOOP-02 updateLoopRegion syncs state.loop and preserves region shape", () => {
    const state = {
      loop: false,
      loopRegion: {
        in: 0,
        out: 30,
        enabled: false,
      },
    };
    const store = {
      state,
      mutate(recipe) {
        recipe(this.state);
      },
    };

    updateLoopRegion(store, {
      in: 4,
      out: 9,
      enabled: true,
    });

    expect(state.loop).toBe(true);
    expect(state.loopRegion).toEqual({
      in: 4,
      out: 9,
      enabled: true,
    });
  });

  it("LOOP-03 advancePlaybackTime stops at the timeline end when loop mode is off", () => {
    expect(advancePlaybackTime(29.6, 1, 30, {
      in: 4,
      out: 8,
      enabled: false,
    })).toEqual({
      playhead: 30,
      playing: false,
    });
  });

  it("LOOP-04 advancePlaybackTime wraps from out to in when loop mode is on", () => {
    expect(advancePlaybackTime(7.6, 0.8, 30, {
      in: 5,
      out: 8,
      enabled: true,
    })).toEqual({
      playhead: 5.4,
      playing: true,
    });
  });

  it("LOOP-05 mountLoopRegion injects loop markers into the ruler", () => {
    if (typeof document === "undefined") {
      skip("Loop region DOM mounting test requires a DOM environment");
    }

    const ruler = document.createElement("div");
    ruler.dataset.timelineDuration = "30";
    document.body.appendChild(ruler);

    const store = {
      state: {
        loopRegion: {
          in: 3,
          out: 12,
          enabled: true,
        },
      },
      mutate(recipe) {
        recipe(this.state);
      },
    };
    const zoom = {
      timeToPx(time) {
        return time * 10;
      },
      pxToTime(px) {
        return px / 10;
      },
    };

    const mounted = mountLoopRegion(ruler, store, zoom);
    const markers = ruler.querySelectorAll(".timeline-loop-region__marker");

    expect(markers.length).toBe(2);
    expect(ruler.querySelector(".timeline-loop-region__fill")?.hidden).toBe(false);

    mounted.destroy();
    ruler.remove();
  });
});
