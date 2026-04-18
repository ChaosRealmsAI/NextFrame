// self-verify — attach __nf builtins to window.
// ai-coding-mindset #4: verification capabilities live INSIDE product code.
// Not a test helper; shipped runtime surface.
//
// Surface (v1.2 — full control surface exposed for AI-operable verification):
//   window.__nf.getState()        — pure read of current state (incl. loop + duration_ms)
//   window.__nf.seek(t, opts?)    — jump to t_ms (pause-by-default per ADR-035)
//   window.__nf.play()            — resume playback
//   window.__nf.pause()           — pause playback
//   window.__nf.setLoop(on)       — toggle loop mode
//   window.__nf.onTimeUpdate(cb)  — subscribe to RAF-tick time updates (returns unsubscribe)
//   window.__nf.screenshot()      — Promise<dataURL | snapshot>
//   window.__nf.log(level,msg,d)  — structured JSON line to console
//   window.__nf.simulate(op)      — AI-operable action dispatcher (walks same code path as UI)

export function attachSelfVerify(handle) {
  const g = globalThis;
  if (!g.window) return; // Node / non-browser — no-op.

  const nf = {
    // --- read-only state ---
    getState() {
      return handle.getState();
    },

    // --- capture ---
    screenshot() {
      return handle.screenshot();
    },

    // --- structured log ---
    log(level, msg, data) {
      handle.log(level, msg, data);
    },

    // --- action simulator — walks the same code path as UI interactions ---
    // op shape: { kind: 'seek' | 'play' | 'pause' | 'setLoop' | 'restart', t_ms?, enabled? }
    simulate(op) {
      if (!op || typeof op.kind !== "string") {
        handle.log("error", "simulate.bad_op", { op });
        return { ok: false, error: "bad_op" };
      }
      switch (op.kind) {
        case "seek":
        case "seekTo": {
          const t = typeof op.t_ms === "number" ? op.t_ms : (op.t || 0);
          handle.seek(t);
          handle.log("info", "simulate.seek", { t_ms: t });
          return { ok: true };
        }
        case "play": {
          handle.play();
          handle.log("info", "simulate.play", {});
          return { ok: true };
        }
        case "pause": {
          handle.pause();
          handle.log("info", "simulate.pause", {});
          return { ok: true };
        }
        case "setLoop":
        case "loop": {
          const enabled = op.enabled !== undefined ? !!op.enabled : !handle._loop;
          handle.setLoop(enabled);
          handle.log("info", "simulate.setLoop", { enabled });
          return { ok: true };
        }
        case "restart": {
          handle.seek(0);
          handle.play();
          handle.log("info", "simulate.restart", {});
          return { ok: true };
        }
        default:
          handle.log("error", "simulate.unknown_kind", { kind: op.kind });
          return { ok: false, error: "unknown_kind" };
      }
    },

    // --- handle passthroughs (v1.2 control surface) ---
    // Bound to handle so callers may `const {seek} = window.__nf` without losing this.
    seek: handle.seek.bind(handle),
    play: handle.play.bind(handle),
    pause: handle.pause.bind(handle),
    setLoop: handle.setLoop.bind(handle),
    onTimeUpdate: handle.onTimeUpdate.bind(handle),
    __diagnostics: () => handle.__diagnostics(),
  };

  g.window.__nf = nf;
  return nf;
}
