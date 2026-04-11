const SCRUB_INTERVAL_MS = 33;
const scrubSessions = new WeakMap();

function getNow() {
  if (globalThis.performance && typeof globalThis.performance.now === "function") {
    return globalThis.performance.now();
  }

  return Date.now();
}

function normalizePlayhead(playhead) {
  const value = Number(playhead);
  return Number.isFinite(value) ? value : 0;
}

function setScrubbingFlag(store, scrubbing) {
  const nextValue = Boolean(scrubbing);
  if (Boolean(store?.state?.scrubbing) === nextValue) {
    return;
  }

  if (typeof store?.mutate === "function") {
    store.mutate((state) => {
      state.scrubbing = nextValue;
    });
    return;
  }

  if (store?.state && typeof store.replace === "function") {
    store.replace({
      ...store.state,
      scrubbing: nextValue,
    });
    return;
  }

  throw new TypeError("scrubbing requires a store with mutate() or replace()");
}

function commitPlayhead(store, playhead) {
  const nextPlayhead = normalizePlayhead(playhead);
  if (normalizePlayhead(store?.state?.playhead) === nextPlayhead) {
    return;
  }

  if (typeof store?.dispatch === "function") {
    store.dispatch({
      type: "setPlayhead",
      playhead: nextPlayhead,
    });
    return;
  }

  if (typeof store?.mutate === "function") {
    store.mutate((state) => {
      state.playhead = nextPlayhead;
    });
    return;
  }

  if (store?.state && typeof store.replace === "function") {
    store.replace({
      ...store.state,
      playhead: nextPlayhead,
    });
    return;
  }

  throw new TypeError("playhead updates require a store with dispatch(), mutate(), or replace()");
}

function flushPendingPlayhead(store, session) {
  if (session.timerId !== 0) {
    globalThis.clearTimeout(session.timerId);
    session.timerId = 0;
  }

  if (session.pendingPlayhead == null) {
    return;
  }

  const nextPlayhead = session.pendingPlayhead;
  session.pendingPlayhead = null;
  session.lastCommitAt = getNow();
  commitPlayhead(store, nextPlayhead);
}

export function setScrubPlayhead(store, playhead) {
  const session = scrubSessions.get(store);
  if (!session) {
    commitPlayhead(store, playhead);
    return;
  }

  session.pendingPlayhead = normalizePlayhead(playhead);

  const now = getNow();
  const elapsed = now - session.lastCommitAt;
  if (session.lastCommitAt === 0 || elapsed >= SCRUB_INTERVAL_MS) {
    flushPendingPlayhead(store, session);
    return;
  }

  if (session.timerId !== 0) {
    return;
  }

  session.timerId = globalThis.setTimeout(() => {
    session.timerId = 0;
    flushPendingPlayhead(store, session);
  }, Math.max(0, SCRUB_INTERVAL_MS - elapsed));
}

export function startScrubbing(store, { onEnd } = {}) {
  if (!store?.state || (typeof store.mutate !== "function" && typeof store.replace !== "function")) {
    throw new TypeError("startScrubbing(store, options) requires a store with state and mutate()/replace()");
  }

  const existingSession = scrubSessions.get(store);
  if (existingSession) {
    existingSession.onEnd = typeof onEnd === "function" ? onEnd : null;
    setScrubbingFlag(store, true);
    return;
  }

  scrubSessions.set(store, {
    lastCommitAt: 0,
    onEnd: typeof onEnd === "function" ? onEnd : null,
    pendingPlayhead: null,
    timerId: 0,
  });

  setScrubbingFlag(store, true);
}

export function endScrubbing(store) {
  const session = scrubSessions.get(store);
  if (!session) {
    setScrubbingFlag(store, false);
    return;
  }

  flushPendingPlayhead(store, session);
  scrubSessions.delete(store);
  setScrubbingFlag(store, false);

  if (typeof session.onEnd === "function") {
    session.onEnd({
      playhead: normalizePlayhead(store?.state?.playhead),
    });
  }
}
