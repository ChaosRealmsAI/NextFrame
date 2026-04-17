// Play mode — RAF-driven loop. Walking stub: returns a controller with no-op tick.

export function startPlay() {
  let running = false;
  return {
    mode: "play",
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    isRunning() {
      return running;
    },
  };
}
