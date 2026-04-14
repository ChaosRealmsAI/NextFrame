// Pipeline media playback helpers for audio, karaoke sync, and inline or modal video preview.
let _plAudio = null;
let _plAudioBtn = null;
let _plAudioChars = [];
let _plAudioRaf = 0;
const PIPELINE_PROJECTS_ROOT = "~/NextFrame/projects/";

function buildPipelineMediaUrl(filePath) {
  let relativePath = String(filePath || "");
  if (!relativePath) {
    return "";
  }
  if (relativePath.indexOf(PIPELINE_PROJECTS_ROOT) === 0) {
    relativePath = relativePath.slice(PIPELINE_PROJECTS_ROOT.length);
  }
  const parts = relativePath.split("/").filter(function(part) {
    return part.length > 0;
  });
  if (parts.length === 0) {
    return "";
  }
  if (typeof buildNfdataUrl === "function") {
    return buildNfdataUrl(parts);
  }
  return "nfdata://localhost/" + parts.map(function(part) {
    return encodeURIComponent(String(part));
  }).join("/");
}

function setPipelineAudioButtonState(btn, isPlayingNow) {
  if (!btn) {
    return;
  }
  btn.classList.toggle("playing", Boolean(isPlayingNow));
  btn.innerHTML = isPlayingNow ? "&#10074;&#10074;" : "&#9654;";
  btn.setAttribute("data-nf-action", isPlayingNow ? "pause" : "play");
  btn.setAttribute("data-nf-state", isPlayingNow ? "playing" : "paused");
}

function setPipelineKaraokeCharState(span, state) {
  if (!span) {
    return;
  }
  const className = "karaoke-char " + state;
  if (span.className !== className) {
    span.className = className;
  }
}

function resetPipelineKaraokeChars() {
  for (let i = 0; i < _plAudioChars.length; i++) {
    setPipelineKaraokeCharState(_plAudioChars[i], "unspoken");
  }
  _plAudioChars = [];
}

function stopPipelineKaraokeLoop() {
  if (_plAudioRaf) {
    cancelAnimationFrame(_plAudioRaf);
    _plAudioRaf = 0;
  }
}

function updatePipelineKaraokeChars(currentAudioTime) {
  for (let i = 0; i < _plAudioChars.length; i++) {
    const span = _plAudioChars[i];
    const start = parseFloat(span.dataset.start);
    const end = parseFloat(span.dataset.end);
    if (currentAudioTime >= end) {
      setPipelineKaraokeCharState(span, "spoken");
    } else if (currentAudioTime >= start) {
      setPipelineKaraokeCharState(span, "current");
    } else {
      setPipelineKaraokeCharState(span, "unspoken");
    }
  }
}

function startPipelineKaraokeLoop(btn) {
  stopPipelineKaraokeLoop();
  resetPipelineKaraokeChars();
  if (!_plAudio || !btn) {
    return;
  }

  const row = btn.closest ? btn.closest("tr[data-seg]") : null;
  if (!row) {
    return;
  }

  _plAudioChars = Array.prototype.slice.call(row.querySelectorAll(".karaoke-char"));
  if (_plAudioChars.length === 0) {
    return;
  }

  function karaokeLoop() {
    if (!_plAudio || _plAudio.paused) {
      _plAudioRaf = 0;
      return;
    }
    updatePipelineKaraokeChars(_plAudio.currentTime || 0);
    _plAudioRaf = requestAnimationFrame(karaokeLoop);
  }

  updatePipelineKaraokeChars(_plAudio.currentTime || 0);
  _plAudioRaf = requestAnimationFrame(karaokeLoop);
}

function resetPipelineAudioPlayback(options) {
  stopPipelineKaraokeLoop();
  if (!options || !options.keepKaraokeState) {
    resetPipelineKaraokeChars();
  }
  if (_plAudio) {
    _plAudio.pause();
    _plAudio.onended = null;
    _plAudio.onerror = null;
    _plAudio = null;
  }
  if (_plAudioBtn) {
    setPipelineAudioButtonState(_plAudioBtn, false);
    _plAudioBtn = null;
  }
}

function playPipelineAudio(btn, filePath) {
  if (!btn || !filePath) {
    return;
  }
  const isSameButton = _plAudioBtn === btn && btn.classList.contains("playing");
  resetPipelineAudioPlayback();
  if (isSameButton) {
    return;
  }

  const url = buildPipelineMediaUrl(filePath);
  if (!url) {
    return;
  }
  try {
    _plAudio = new Audio(url);
    _plAudioBtn = btn;
    setPipelineAudioButtonState(btn, true);
    _plAudio.onerror = function() {
      console.error("[pipeline] audio error:", _plAudio && _plAudio.error);
      resetPipelineAudioPlayback();
    };
    const playPromise = _plAudio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.then(function() {
        startPipelineKaraokeLoop(btn);
      }).catch(function(error) {
        console.error("[pipeline] audio play promise rejected:", error.message);
        resetPipelineAudioPlayback();
      });
    } else {
      startPipelineKaraokeLoop(btn);
    }
    _plAudio.onended = function() {
      resetPipelineAudioPlayback({ keepKaraokeState: true });
    };
  } catch (error) {
    console.error("[pipeline] audio exception:", error.message);
    resetPipelineAudioPlayback();
  }
}

function playPipelineVideo(filePath) {
  if (!filePath) {
    return;
  }
  removePipelineInlineVideo();
  const url = buildPipelineMediaUrl(filePath);
  const name = filePath.split("/").pop() || "clip.mp4";
  openPlayer(name, url, filePath);
}

let _inlineVideo = null;
let _inlineVideoBtn = null;

function removePipelineInlineVideo() {
  if (!_inlineVideo) {
    _inlineVideoBtn = null;
    return;
  }
  _inlineVideo.pause();
  _inlineVideo.removeAttribute("src");
  if (_inlineVideo.parentElement) {
    _inlineVideo.parentElement.removeChild(_inlineVideo);
  }
  _inlineVideo = null;
  _inlineVideoBtn = null;
}

function playPipelineVideoInline(btn) {
  if (!btn) return;
  const filePath = btn.dataset.videoPath;
  if (!filePath) return;
  const url = buildPipelineMediaUrl(filePath);
  if (!url) return;

  if (_inlineVideo && _inlineVideoBtn === btn) {
    removePipelineInlineVideo();
    return;
  }

  removePipelineInlineVideo();

  // Find the thumbnail container (parent of the button)
  const container = btn.closest(".clips-src-thumb") || btn.closest(".clips-row-thumb-mini") || btn.closest(".cd-preview") || btn.parentElement;
  if (!container) return;

  const video = document.createElement("video");
  video.className = "pipeline-inline-video";
  video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:2;border-radius:inherit";
  video.preload = "metadata";
  video.playsInline = true;
  video.setAttribute("playsinline", "playsinline");
  video.controls = true;
  video.autoplay = true;
  video.setAttribute("data-nf-state", "loading");
  container.style.position = "relative";
  container.appendChild(video);
  _inlineVideo = video;
  _inlineVideoBtn = btn;

  video.src = url;
  video.play().catch(function(e) {
    console.error("[pipeline] inline video play failed:", e.message);
    removePipelineInlineVideo();
  });

  video.onplay = function() {
    video.setAttribute("data-nf-state", "playing");
  };
  video.onpause = function() {
    if (_inlineVideo === video) {
      video.setAttribute("data-nf-state", "paused");
    }
  };
  video.onerror = function() {
    console.error("[pipeline] inline video error:", video.error);
    removePipelineInlineVideo();
  };
  video.onended = function() {
    removePipelineInlineVideo();
  };
}
