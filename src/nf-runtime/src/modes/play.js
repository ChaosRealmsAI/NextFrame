// Play mode — RAF self-driven playback.
//
// Owns a `t` that advances by (now - lastNow) * playbackRate per RAF tick.
// `performance.now()` is the allowed time source here (axiom 4 — play mode
// is the one mode where internal clock is permitted).

const noop = () => {};

export function createPlay({ host, options = {} }) {
  const duration = Number(options.duration) || Infinity;
  const loopMode = options.loopMode || "loop"; // 'loop' | 'stop'
  let playbackRate = Number(options.playbackRate) || 1;
  let running = false;
  let lastNow = 0;
  let rafId = 0;
  const rafFn = options.raf || globalThis.requestAnimationFrame;
  const cancelRafFn = options.cancelRaf || globalThis.cancelAnimationFrame;
  const nowFn = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
  const onEnd = typeof options.onEnd === "function" ? options.onEnd : noop;

  if (typeof rafFn !== "function") {
    throw new Error("play mode: requestAnimationFrame not available");
  }

  const tick = () => {
    if (!running) return;
    const now = nowFn();
    const dt = Math.max(0, now - lastNow) / 1000;
    lastNow = now;
    let next = host.getT() + dt * playbackRate;
    if (next >= duration) {
      if (loopMode === "loop" && isFinite(duration)) {
        next = duration > 0 ? next % duration : 0;
      } else {
        next = duration;
        host.setT(next);
        host.render();
        running = false;
        onEnd();
        return;
      }
    }
    host.setT(next);
    host.render();
    rafId = rafFn(tick);
  };

  const resume = () => {
    if (running) return;
    running = true;
    lastNow = nowFn();
    rafId = rafFn(tick);
  };

  const pause = () => {
    if (!running) return;
    running = false;
    if (rafId && typeof cancelRafFn === "function") cancelRafFn(rafId);
    rafId = 0;
  };

  const seek = (t) => {
    host.setT(t);
    host.render();
  };

  const setPlaybackRate = (x) => {
    playbackRate = Number(x) || 0;
  };

  const isRunning = () => running;

  return {
    mode: "play",
    start: resume,
    resume,
    pause,
    seek,
    setPlaybackRate,
    isRunning,
    getT: () => host.getT(),
    diagnose: () => ({ mode: "play", running, playbackRate, ...host.diagnose() }),
  };
}

// Back-compat shim for the walking-stub callers.
export function startPlay(arg) {
  if (arg && arg.host) return createPlay(arg);
  let running = false;
  return {
    mode: "play",
    start() { running = true; },
    stop() { running = false; },
    isRunning() { return running; },
  };
}
