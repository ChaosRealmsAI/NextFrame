/* === pipeline/media.js === */
var _plAudio = null;
var _plAudioBtn = null;
var _plAudioChars = [];
var _plAudioRaf = 0;
var PIPELINE_PROJECTS_ROOT = "~/NextFrame/projects/";

function buildPipelineMediaUrl(filePath) {
  var relativePath = String(filePath || "");
  if (!relativePath) {
    return "";
  }
  if (relativePath.indexOf(PIPELINE_PROJECTS_ROOT) === 0) {
    relativePath = relativePath.slice(PIPELINE_PROJECTS_ROOT.length);
  }
  var parts = relativePath.split("/").filter(function(part) {
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
}

function setPipelineKaraokeCharState(span, state) {
  if (!span) {
    return;
  }
  var className = "karaoke-char " + state;
  if (span.className !== className) {
    span.className = className;
  }
}

function resetPipelineKaraokeChars() {
  for (var i = 0; i < _plAudioChars.length; i++) {
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
  for (var i = 0; i < _plAudioChars.length; i++) {
    var span = _plAudioChars[i];
    var start = parseFloat(span.dataset.start);
    var end = parseFloat(span.dataset.end);
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

  var row = btn.closest ? btn.closest("tr[data-seg]") : null;
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
  var isSameButton = _plAudioBtn === btn && btn.classList.contains("playing");
  resetPipelineAudioPlayback();
  if (isSameButton) {
    return;
  }

  var url = buildPipelineMediaUrl(filePath);
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
    var playPromise = _plAudio.play();
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
  var url = buildPipelineMediaUrl(filePath);
  var name = filePath.split("/").pop() || "clip.mp4";
  openPlayer(name, url, filePath);
}

var _inlineVideo = null;
var _inlineVideoBtn = null;

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
  var filePath = btn.dataset.videoPath;
  if (!filePath) return;
  var url = buildPipelineMediaUrl(filePath);
  if (!url) return;

  if (_inlineVideo && _inlineVideoBtn === btn) {
    removePipelineInlineVideo();
    return;
  }

  removePipelineInlineVideo();

  // Find the thumbnail container (parent of the button)
  var container = btn.closest(".clips-src-thumb") || btn.closest(".clips-row-thumb-mini") || btn.closest(".cd-preview") || btn.parentElement;
  if (!container) return;

  var video = document.createElement("video");
  video.className = "pipeline-inline-video";
  video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:2;border-radius:inherit";
  video.preload = "metadata";
  video.playsInline = true;
  video.setAttribute("playsinline", "playsinline");
  video.controls = true;
  video.autoplay = true;
  container.style.position = "relative";
  container.appendChild(video);
  _inlineVideo = video;
  _inlineVideoBtn = btn;

  video.src = url;
  video.play().catch(function(e) {
    console.error("[pipeline] inline video play failed:", e.message);
    removePipelineInlineVideo();
  });

  video.onerror = function() {
    console.error("[pipeline] inline video error:", video.error);
    removePipelineInlineVideo();
  };
  video.onended = function() {
    removePipelineInlineVideo();
  };
}
