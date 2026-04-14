/* === fullscreen.js === */
function toggleFullscreen() {
  document.getElementById("view-editor").classList.toggle("fullscreen");
  requestAnimationFrame(fitStageToContainer);
}
