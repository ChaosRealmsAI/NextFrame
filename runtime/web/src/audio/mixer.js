import { createProjectAssetIndex, normalizeAudioUrl } from "./buffer.js";
import { hasSoloTrack, shouldRenderTrack } from "../track-flags.js";

function readFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function wrapTime(time, duration) {
  if (!(duration > 0)) {
    return 0;
  }

  const normalized = time % duration;
  return normalized >= 0 ? normalized : normalized + duration;
}

function wrapDelta(actual, expected, duration) {
  if (!(duration > 0)) {
    return actual - expected;
  }

  const delta = wrapTime(actual - expected + duration / 2, duration) - duration / 2;
  return delta;
}

function isAudioBufferLike(value) {
  return Boolean(value)
    && typeof value.duration === "number"
    && typeof value.numberOfChannels === "number"
    && typeof value.getChannelData === "function";
}

function resolveClipSourceUrl(clip, assetIndex) {
  const params = clip?.params && typeof clip.params === "object" ? clip.params : {};
  const assetId = typeof params.assetId === "string" && params.assetId.length > 0
    ? params.assetId
    : typeof clip?.assetId === "string" && clip.assetId.length > 0
      ? clip.assetId
      : null;

  if (assetId && assetIndex.byId.has(assetId)) {
    const asset = assetIndex.byId.get(assetId);
    return normalizeAudioUrl(asset?.path || asset?.url);
  }

  const directUrl = params.src ?? clip?.src ?? null;
  const normalizedDirectUrl = normalizeAudioUrl(directUrl);
  if (normalizedDirectUrl) {
    return normalizedDirectUrl;
  }

  return null;
}

function collectScheduleEntries(state, playhead, horizon) {
  const duration = readFiniteNumber(state?.timeline?.duration, 0);
  if (!(duration > 0)) {
    return [];
  }

  const assetBuffers = state?.assetBuffers instanceof Map ? state.assetBuffers : null;
  if (!assetBuffers) {
    return [];
  }

  const assetIndex = createProjectAssetIndex(state);
  const tracks = Array.isArray(state?.timeline?.tracks) ? state.timeline.tracks : [];
  const soloActive = hasSoloTrack(tracks);
  const loopEnabled = state?.loop !== false;
  const windowStart = loopEnabled
    ? wrapTime(playhead, duration)
    : clamp(readFiniteNumber(playhead, 0), 0, duration);
  const windowEnd = loopEnabled
    ? windowStart + horizon
    : Math.min(duration, windowStart + horizon);
  const entries = [];

  tracks.forEach((track) => {
    if (track?.kind !== "audio" || !shouldRenderTrack(track, soloActive)) {
      return;
    }

    const clips = Array.isArray(track?.clips) ? track.clips : [];
    clips.forEach((clip) => {
      if (clip?.muted) {
        return;
      }

      const sourceUrl = resolveClipSourceUrl(clip, assetIndex);
      const audioBuffer = sourceUrl ? assetBuffers.get(sourceUrl) : null;
      if (!isAudioBufferLike(audioBuffer)) {
        return;
      }

      const clipStartTime = readFiniteNumber(clip?.start, 0);
      const clipDuration = readFiniteNumber(clip?.duration ?? clip?.dur, 0);
      if (!(clipDuration > 0)) {
        return;
      }

      const params = clip?.params && typeof clip.params === "object" ? clip.params : {};
      const sourceOffset = clamp(
        readFiniteNumber(params.clipStart ?? params.startOffset ?? params.offset, 0),
        0,
        Math.max(audioBuffer.duration, 0),
      );
      const maxPlayableDuration = Math.max(0, audioBuffer.duration - sourceOffset);
      const clipPlayableDuration = Math.min(
        clipDuration,
        readFiniteNumber(params.clipDur, clipDuration),
        maxPlayableDuration,
      );

      if (!(clipPlayableDuration > 0)) {
        return;
      }

      const volume = clamp(readFiniteNumber(params.volume, clip?.volume ?? 1), 0, 4);
      const gainAutomation = params.gainAutomation;

      for (let cycleOffset = 0; clipStartTime + cycleOffset < windowEnd; cycleOffset += duration) {
        const occurrenceStart = clipStartTime + cycleOffset;
        const occurrenceEnd = occurrenceStart + clipPlayableDuration;
        const intersectStart = Math.max(windowStart, occurrenceStart);
        const intersectEnd = Math.min(windowEnd, occurrenceEnd);

        if (!(intersectEnd > intersectStart)) {
          continue;
        }

        const clipOffset = intersectStart - occurrenceStart;
        entries.push({
          audioBuffer,
          startTime: intersectStart - windowStart,
          clipStart: sourceOffset + clipOffset,
          clipDur: intersectEnd - intersectStart,
          volume,
          gainAutomation,
        });

        if (!loopEnabled) {
          break;
        }
      }
    });
  });

  return entries;
}

export function createMixer({ audioContext, getAudioContext, getState = () => null } = {}) {
  const scheduledNodes = new Set();
  let session = null;
  let masterVolume = 1;
  let masterGain = null;
  let masterGainContext = null;

  function resolveAudioContext() {
    return typeof getAudioContext === "function" ? getAudioContext() : audioContext;
  }

  function getMasterGain(activeAudioContext) {
    if (!activeAudioContext) {
      return null;
    }

    if (masterGain && masterGainContext === activeAudioContext) {
      return masterGain;
    }

    if (masterGain) {
      try {
        masterGain.disconnect();
      } catch {
        // Best effort cleanup.
      }
    }

    masterGainContext = activeAudioContext;
    masterGain = activeAudioContext.createGain();
    masterGain.gain.setValueAtTime(masterVolume, activeAudioContext.currentTime);
    masterGain.connect(activeAudioContext.destination);
    return masterGain;
  }

  function removeScheduled(entry) {
    scheduledNodes.delete(entry);
    try {
      entry.source.disconnect();
    } catch {
      // Best effort cleanup.
    }
    try {
      entry.gain.disconnect();
    } catch {
      // Best effort cleanup.
    }
  }

  function stop() {
    for (const entry of [...scheduledNodes]) {
      try {
        entry.source.stop();
      } catch {
        // Source may already be finished.
      }
      removeScheduled(entry);
    }
    session = null;
  }

  function playAt(audioBuffer, {
    startTime = 0,
    clipStart = 0,
    clipDur = 0,
    volume = 1,
    gainAutomation = null,
  } = {}) {
    const activeAudioContext = resolveAudioContext();
    if (!activeAudioContext || !isAudioBufferLike(audioBuffer)) {
      return null;
    }

    const safeClipStart = clamp(readFiniteNumber(clipStart, 0), 0, Math.max(audioBuffer.duration, 0));
    const safeClipDur = Math.min(
      Math.max(0, readFiniteNumber(clipDur, 0)),
      Math.max(0, audioBuffer.duration - safeClipStart),
    );

    if (!(safeClipDur > 0)) {
      return null;
    }

    const when = activeAudioContext.currentTime + Math.max(0, readFiniteNumber(startTime, 0));
    const gain = activeAudioContext.createGain();
    const source = activeAudioContext.createBufferSource();
    const safeVolume = clamp(readFiniteNumber(volume, 1), 0, 4);

    source.buffer = audioBuffer;
    source.connect(gain);
    gain.connect(getMasterGain(activeAudioContext) ?? activeAudioContext.destination);
    gain.gain.setValueAtTime(safeVolume, when);

    if (Array.isArray(gainAutomation)) {
      gainAutomation.forEach((point, index) => {
        const pointTime = when + clamp(readFiniteNumber(point?.time, 0), 0, safeClipDur);
        const pointValue = clamp(readFiniteNumber(point?.value, safeVolume), 0, 4);
        if (index === 0) {
          gain.gain.setValueAtTime(pointValue, pointTime);
        } else {
          gain.gain.linearRampToValueAtTime(pointValue, pointTime);
        }
      });
    }

    const entry = { source, gain };
    source.addEventListener("ended", () => removeScheduled(entry), { once: true });
    scheduledNodes.add(entry);
    source.start(when, safeClipStart, safeClipDur);
    return entry;
  }

  function syncToPlayhead(playhead, isPlaying) {
    const activeAudioContext = resolveAudioContext();
    if (!activeAudioContext) {
      return;
    }

    if (!isPlaying) {
      stop();
      return;
    }

    const state = getState();
    const duration = readFiniteNumber(state?.timeline?.duration, 0);
    const loopEnabled = state?.loop !== false;
    const normalizedPlayhead = loopEnabled
      ? wrapTime(playhead, duration)
      : clamp(readFiniteNumber(playhead, 0), 0, duration);

    if (activeAudioContext.state === "suspended" && typeof activeAudioContext.resume === "function") {
      const result = activeAudioContext.resume();
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    }

    const sessionChanged = !session
      || session.timeline !== state?.timeline
      || session.assets !== state?.assets
      || session.assetBuffers !== state?.assetBuffers
      || session.duration !== duration
      || session.loopEnabled !== loopEnabled;

    if (!sessionChanged && session) {
      const elapsed = Math.max(0, activeAudioContext.currentTime - session.audioTime);
      const expectedPlayhead = loopEnabled
        ? wrapTime(session.playhead + elapsed, duration)
        : Math.min(session.playhead + elapsed, duration);
      const drift = loopEnabled
        ? Math.abs(wrapDelta(normalizedPlayhead, expectedPlayhead, duration))
        : Math.abs(normalizedPlayhead - expectedPlayhead);
      const didWrap = loopEnabled && normalizedPlayhead + 0.25 < session.lastObservedPlayhead;

      session.lastObservedPlayhead = normalizedPlayhead;
      if (!didWrap && drift <= 0.12) {
        return;
      }
    }

    stop();

    const scheduleEntries = collectScheduleEntries(
      state,
      normalizedPlayhead,
      Math.max(duration * 2, 2),
    );

    scheduleEntries.forEach((entry) => {
      playAt(entry.audioBuffer, entry);
    });

    session = {
      playhead: normalizedPlayhead,
      audioTime: activeAudioContext.currentTime,
      duration,
      timeline: state?.timeline,
      assets: state?.assets,
      assetBuffers: state?.assetBuffers,
      loopEnabled,
      lastObservedPlayhead: normalizedPlayhead,
    };
  }

  function setMasterVolume(volume) {
    masterVolume = clamp(readFiniteNumber(volume, 1), 0, 1);
    const activeAudioContext = resolveAudioContext();
    const activeMasterGain = getMasterGain(activeAudioContext);
    if (activeMasterGain) {
      activeMasterGain.gain.setValueAtTime(masterVolume, activeAudioContext.currentTime);
    }
    return masterVolume;
  }

  return {
    getMasterVolume: () => masterVolume,
    playAt,
    setMasterVolume,
    stop,
    syncToPlayhead,
  };
}
