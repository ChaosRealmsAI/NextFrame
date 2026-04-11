import { normalizeLoopRegion } from "../loop-region.js";

function clampTime(time, duration) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  return Math.min(Math.max(0, Number(time) || 0), safeDuration);
}

export function advancePlaybackTime(currentTime, dt, duration, loopRegion) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const safeCurrentTime = clampTime(currentTime, safeDuration);
  const safeDt = Math.max(0, Number(dt) || 0);
  const nextTime = clampTime(safeCurrentTime + safeDt, safeDuration);
  const normalizedLoopRegion = normalizeLoopRegion(loopRegion, { duration: safeDuration });
  const loopEnabled = normalizedLoopRegion.enabled && normalizedLoopRegion.out > normalizedLoopRegion.in;

  if (!loopEnabled) {
    return {
      playhead: nextTime,
      playing: !(safeDuration > 0 && nextTime >= safeDuration),
    };
  }

  if (safeCurrentTime >= normalizedLoopRegion.out) {
    return {
      playhead: normalizedLoopRegion.in,
      playing: true,
    };
  }

  if (nextTime < normalizedLoopRegion.out) {
    return {
      playhead: nextTime,
      playing: true,
    };
  }

  const loopDuration = normalizedLoopRegion.out - normalizedLoopRegion.in;
  const overflow = nextTime - normalizedLoopRegion.out;

  return {
    playhead: normalizedLoopRegion.in + (loopDuration > 0 ? overflow % loopDuration : 0),
    playing: true,
  };
}

export function createLoop({ tick, getTime }) {
  if (typeof tick !== "function") {
    throw new TypeError("createLoop({ tick, getTime }) requires tick to be a function");
  }

  if (typeof getTime !== "function") {
    throw new TypeError("createLoop({ tick, getTime }) requires getTime to be a function");
  }

  const requestFrame = globalThis.requestAnimationFrame
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (callback) => globalThis.setTimeout(() => callback(Date.now()), 16);
  const cancelFrame = globalThis.cancelAnimationFrame
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : globalThis.clearTimeout.bind(globalThis);

  let playing = false;
  let stopped = false;
  let frameId = 0;
  let lastFrameTime = null;

  const schedule = () => {
    if (!playing || stopped || frameId !== 0) {
      return;
    }

    frameId = requestFrame((now) => {
      frameId = 0;

      if (!playing || stopped) {
        return;
      }

      const previousFrameTime = lastFrameTime ?? now;
      const dt = Math.max(0, (now - previousFrameTime) / 1000);
      lastFrameTime = now;

      tick(getTime(), dt, now);
      schedule();
    });
  };

  return {
    play() {
      if (stopped || playing) {
        return;
      }

      playing = true;
      lastFrameTime = null;
      schedule();
    },
    pause() {
      if (!playing) {
        return;
      }

      playing = false;
      lastFrameTime = null;
      if (frameId !== 0) {
        cancelFrame(frameId);
        frameId = 0;
      }
    },
    stop() {
      if (frameId !== 0) {
        cancelFrame(frameId);
        frameId = 0;
      }

      playing = false;
      stopped = true;
      lastFrameTime = null;
    },
    isPlaying() {
      return playing && !stopped;
    },
  };
}
