let audioContext = null;
let resumeListenerBound = false;
let resumeListener = null;

function getAudioContextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function hasUserActivation() {
  return Boolean(globalThis.navigator?.userActivation?.isActive);
}

function createAudioContext() {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }

  return audioContext;
}

function detachResumeListener() {
  if (!resumeListenerBound || typeof document === "undefined" || typeof resumeListener !== "function") {
    return;
  }

  document.removeEventListener("click", resumeListener, true);
  resumeListenerBound = false;
}

function bindResumeListener(context) {
  if (resumeListenerBound || typeof document === "undefined") {
    return;
  }

  resumeListener = () => {
    const activeContext = context || createAudioContext();
    if (!activeContext) {
      return;
    }

    const result = typeof activeContext.resume === "function" ? activeContext.resume() : null;
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }

    if (activeContext.state === "running") {
      detachResumeListener();
    }
  };

  document.addEventListener("click", resumeListener, true);
  resumeListenerBound = true;
}

export function getAudioContext() {
  if (!getAudioContextConstructor()) {
    return null;
  }

  if (audioContext) {
    bindResumeListener(audioContext);
    if (hasUserActivation()) {
      const result = typeof audioContext.resume === "function" ? audioContext.resume() : null;
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    }

    if (audioContext.state === "running") {
      detachResumeListener();
    }

    return audioContext;
  }

  if (hasUserActivation()) {
    const context = createAudioContext();
    bindResumeListener(context);
    return context;
  }

  bindResumeListener(null);
  return null;
}

export function disposeAudioContextForTests() {
  if (audioContext && typeof audioContext.close === "function") {
    void audioContext.close();
  }
  audioContext = null;
  if (resumeListenerBound) {
    detachResumeListener();
  }
}
