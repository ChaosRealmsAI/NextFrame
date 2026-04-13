import { createDispatcher } from "../../../src/commands.js";
import { store } from "../../../src/store.js";
import { endScrubbing, setScrubPlayhead, startScrubbing } from "../../../src/timeline/scrub.js";
import { describe, expect, it } from "../runner.js";
import { createLocalStore, resetGlobalStore } from "./helpers.js";

describe("BDD critical scenarios", () => {
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
});
