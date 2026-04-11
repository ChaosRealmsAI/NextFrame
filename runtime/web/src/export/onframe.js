const DEFAULT_FPS = 30;

export function installOnFrame({ engine, store, preview } = {}) {
  const renderAt = resolveRenderAt(engine);
  const runtimeStore = resolveStore(store);
  const target = resolveGlobalTarget();
  const meta = createMeta({ store: runtimeStore, preview });

  let recordingModeEnabled = false;

  const enableRecordingMode = () => {
    if (recordingModeEnabled || typeof preview?.setRecordingMode !== "function") {
      return;
    }

    preview.setRecordingMode(true);
    recordingModeEnabled = true;
  };

  const onFrame = (timeSeconds, fps) => {
    const time = readTimeSeconds(timeSeconds);
    void fps;

    const ctx = preview?.ctx;
    if (!ctx) {
      throw new Error("window.__onFrame requires a mounted preview 2D context");
    }

    enableRecordingMode();
    runtimeStore.state.playhead = time;
    renderAt(ctx, runtimeStore.state.timeline, time);

    return {
      ok: true,
      t: time,
    };
  };

  const getImageData = () => {
    const ctx = preview?.ctx;
    const canvas = preview?.canvas;
    if (!ctx || !canvas) {
      throw new Error("window.__onFrame_getImageData requires a mounted preview canvas");
    }

    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const imageData = ctx.getImageData(0, 0, width, height);

    if (typeof canvas.toDataURL === "function") {
      return canvas.toDataURL("image/png");
    }

    return imageData.data.slice().buffer;
  };

  installGlobalBinding(target, "__onFrame", onFrame);
  installGlobalBinding(target, "__onFrame_getImageData", getImageData);
  installGlobalBinding(target, "__onFrame_meta", meta, { writable: false });

  return {
    meta,
    setRecordingMode(active) {
      if (typeof preview?.setRecordingMode === "function") {
        preview.setRecordingMode(active);
      }

      recordingModeEnabled = Boolean(active);
    },
  };
}

function resolveRenderAt(engine) {
  if (typeof engine?.renderAt !== "function") {
    throw new TypeError("installOnFrame({ engine, store, preview }) requires engine.renderAt");
  }

  return engine.renderAt;
}

function resolveStore(store) {
  if (!store || typeof store !== "object" || !store.state || typeof store.state !== "object") {
    throw new TypeError("installOnFrame({ engine, store, preview }) requires store.state");
  }

  return store;
}

function resolveGlobalTarget() {
  if (typeof globalThis !== "object" || globalThis === null) {
    throw new Error("installOnFrame requires globalThis");
  }

  return globalThis;
}

function createMeta({ store, preview }) {
  const meta = {};

  Object.defineProperties(meta, {
    width: {
      enumerable: true,
      get: () => readPositiveInteger(preview?.canvas?.width),
    },
    height: {
      enumerable: true,
      get: () => readPositiveInteger(preview?.canvas?.height),
    },
    duration: {
      enumerable: true,
      get: () => readFiniteNumber(store?.state?.timeline?.duration),
    },
    fps: {
      enumerable: true,
      get: () => readPositiveNumber(store?.state?.project?.fps) || DEFAULT_FPS,
    },
  });

  return Object.freeze(meta);
}

function installGlobalBinding(target, name, value, descriptor = {}) {
  const property = {
    configurable: true,
    enumerable: false,
    writable: true,
    ...descriptor,
    value,
  };

  Object.defineProperty(target, name, property);

  if (typeof window === "object" && window !== null && window !== target) {
    Object.defineProperty(window, name, property);
  }
}

function readTimeSeconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("window.__onFrame(timeSeconds, fps) requires a finite timeSeconds number");
  }

  return value;
}

function readFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readPositiveInteger(value) {
  const number = readFiniteNumber(value);
  return number > 0 ? Math.round(number) : 0;
}

function readPositiveNumber(value) {
  const number = readFiniteNumber(value);
  return number > 0 ? number : 0;
}
