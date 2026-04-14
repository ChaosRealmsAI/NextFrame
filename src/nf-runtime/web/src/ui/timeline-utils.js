// Timeline playback helpers for play state, playhead timing, and duration readouts.
function setPlayButtonIcons() {
  const icon = isPlaying ? "\u23F8" : "\u25B6";
  const primary = document.getElementById("btn-play");
  const fullscreen = document.getElementById("btn-play-fs");
  const nextAction = isPlaying ? "pause" : "play";
  const nextState = isPlaying ? "playing" : "paused";
  if (primary) {
    primary.innerHTML = icon;
    primary.setAttribute("data-nf-action", nextAction);
    primary.setAttribute("data-nf-state", nextState);
  }
  if (fullscreen) {
    fullscreen.innerHTML = icon;
    fullscreen.setAttribute("data-nf-action", nextAction);
    fullscreen.setAttribute("data-nf-state", nextState);
  }
}

function setPlaybackState(nextPlaying) {
  isPlaying = Boolean(nextPlaying);
  setPlayButtonIcons();
  setElementState("timeline", isPlaying ? "playing" : "paused");
  if (playRAF) {
    cancelAnimationFrame(playRAF);
    playRAF = null;
  }
  lastTS = null;

  if (isPlaying) {
    playRAF = requestAnimationFrame(playLoop);
  }
}

function setTotalDuration(duration) {
  TOTAL_DURATION = Math.max(0, finiteNumber(duration, 0));
  setNfTime("tc-total", TOTAL_DURATION, formatPreciseTime(TOTAL_DURATION));
  setNfTime("tc-fs-total", TOTAL_DURATION, formatPreciseTime(TOTAL_DURATION));
  setPlayheadTime(TOTAL_DURATION > 0 ? Math.min(currentTime, TOTAL_DURATION) : 0);
}
