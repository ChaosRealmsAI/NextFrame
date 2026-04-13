/* === timeline.js === */
function setPlayButtonIcons() {
  const icon = isPlaying ? "\u23F8" : "\u25B6";
  const primary = document.getElementById("btn-play");
  const fullscreen = document.getElementById("btn-play-fs");
  if (primary) primary.innerHTML = icon;
  if (fullscreen) fullscreen.innerHTML = icon;
}

function setPlaybackState(nextPlaying) {
  isPlaying = Boolean(nextPlaying);
  setPlayButtonIcons();
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
  setText("tc-total", formatPreciseTime(TOTAL_DURATION));
  setText("tc-fs-total", formatPreciseTime(TOTAL_DURATION));
  setPlayheadTime(TOTAL_DURATION > 0 ? Math.min(currentTime, TOTAL_DURATION) : 0);
}
