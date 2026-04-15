(function () {
  const MIN_TICK_MS = 1000 / 30;
  const state = {
    audioEl: null,
    segments: [],
    lastDispatchAt: -Infinity,
    rafId: 0,
    onEnded: null,
    onPause: null,
    onPlay: null,
    onSeeking: null,
    onTimeUpdate: null,
  };

  function isAudioTrack(track) {
    return Boolean(track && track.kind === "audio");
  }

  function findTrackById(tracks, trackId) {
    if (!Array.isArray(tracks)) {
      return null;
    }
    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      if (track && track.id === trackId) {
        return track;
      }
    }
    return null;
  }

  function resolveAudioTrack(tracks, matches) {
    if (Array.isArray(matches)) {
      for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        if (!match || match.rule !== "subtitle-from-words" || typeof match.source !== "string") {
          continue;
        }
        const sourceTrack = findTrackById(tracks, match.source);
        if (isAudioTrack(sourceTrack)) {
          return sourceTrack;
        }
      }
    }

    if (!Array.isArray(tracks)) {
      return null;
    }
    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      if (isAudioTrack(track) && track.meta && Array.isArray(track.meta.segments)) {
        return track;
      }
    }
    return null;
  }

  function resolveSegments(tracks, matches) {
    const audioTrack = resolveAudioTrack(tracks, matches);
    return audioTrack && audioTrack.meta && Array.isArray(audioTrack.meta.segments)
      ? audioTrack.meta.segments
      : [];
  }

  function findSegmentAt(tMs) {
    for (let index = 0; index < state.segments.length; index += 1) {
      const segment = state.segments[index];
      if (!segment) {
        continue;
      }
      if (tMs >= Number(segment.startMs || 0) && tMs < Number(segment.endMs || 0)) {
        return segment;
      }
    }
    return null;
  }

  function findWordInSegment(segment, tMs) {
    if (!segment || !Array.isArray(segment.words)) {
      return null;
    }
    for (let index = 0; index < segment.words.length; index += 1) {
      const word = segment.words[index];
      if (!word) {
        continue;
      }
      if (tMs >= Number(word.s || 0) && tMs < Number(word.e || 0)) {
        return {
          segmentId:String(segment.id || ""),
          sentenceText:String(segment.text || ""),
          text:String(word.w || ""),
          wordIndex:index,
        };
      }
    }
    return null;
  }

  function buildTickDetail(tMs) {
    const segment = findSegmentAt(tMs);
    if (!segment) {
      return {
        segmentId: null,
        sentenceText: null,
        tMs,
        text: null,
        wordIndex: null,
      };
    }

    const word = findWordInSegment(segment, tMs);
    return {
      segmentId:String(segment.id || ""),
      sentenceText:String(segment.text || ""),
      tMs,
      text: word ? word.text : null,
      wordIndex: word ? word.wordIndex : null,
    };
  }

  function emitTick(force) {
    if (!state.audioEl) {
      return;
    }

    const now = performance.now();
    if (!force && now - state.lastDispatchAt < MIN_TICK_MS) {
      return;
    }
    state.lastDispatchAt = now;

    const tMs = Math.max(0, state.audioEl.currentTime * 1000);
    document.dispatchEvent(new CustomEvent("nf-subtitle-tick", {
      detail: buildTickDetail(tMs),
    }));
  }

  function stopLoop() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
  }

  function frameLoop() {
    if (!state.audioEl || state.audioEl.paused || state.audioEl.ended) {
      state.rafId = 0;
      return;
    }
    emitTick(false);
    state.rafId = requestAnimationFrame(frameLoop);
  }

  function startLoop() {
    if (state.rafId || !state.audioEl) {
      return;
    }
    state.lastDispatchAt = -Infinity;
    state.rafId = requestAnimationFrame(frameLoop);
  }

  function removeListeners() {
    stopLoop();
    if (!state.audioEl) {
      return;
    }
    if (state.onTimeUpdate) {
      state.audioEl.removeEventListener("timeupdate", state.onTimeUpdate);
    }
    if (state.onPlay) {
      state.audioEl.removeEventListener("play", state.onPlay);
    }
    if (state.onPause) {
      state.audioEl.removeEventListener("pause", state.onPause);
    }
    if (state.onSeeking) {
      state.audioEl.removeEventListener("seeking", state.onSeeking);
    }
    if (state.onEnded) {
      state.audioEl.removeEventListener("ended", state.onEnded);
    }
  }

  function init(options) {
    removeListeners();

    const tracks = options && Array.isArray(options.tracks) ? options.tracks : [];
    const matches = options && Array.isArray(options.matches) ? options.matches : [];
    const audioEl = options && options.audioEl instanceof HTMLMediaElement ? options.audioEl : null;

    state.audioEl = audioEl;
    state.segments = resolveSegments(tracks, matches);
    state.lastDispatchAt = -Infinity;
    state.onTimeUpdate = null;
    state.onPlay = null;
    state.onPause = null;
    state.onSeeking = null;
    state.onEnded = null;

    if (!audioEl) {
      return;
    }

    state.onTimeUpdate = function () {
      emitTick(true);
    };
    state.onPlay = function () {
      emitTick(true);
      startLoop();
    };
    state.onPause = function () {
      emitTick(true);
      stopLoop();
    };
    state.onSeeking = function () {
      emitTick(true);
    };
    state.onEnded = function () {
      emitTick(true);
      stopLoop();
    };

    audioEl.addEventListener("timeupdate", state.onTimeUpdate);
    audioEl.addEventListener("play", state.onPlay);
    audioEl.addEventListener("pause", state.onPause);
    audioEl.addEventListener("seeking", state.onSeeking);
    audioEl.addEventListener("ended", state.onEnded);

    emitTick(true);
    if (!audioEl.paused && !audioEl.ended) {
      startLoop();
    }
  }

  function currentWord(tMs) {
    const detail = buildTickDetail(Number(tMs || 0));
    if (detail.segmentId === null || detail.wordIndex === null || detail.text === null) {
      return null;
    }
    return {
      segmentId: detail.segmentId,
      text: detail.text,
      wordIndex: detail.wordIndex,
    };
  }

  window.__narrationRuntime = {
    currentWord,
    init,
  };
})();
