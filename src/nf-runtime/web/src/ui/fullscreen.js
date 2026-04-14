// Fullscreen toggle for the editor view with preview stage refitting after layout changes.
function toggleFullscreen() {
  const editorView = document.getElementById("view-editor");
  editorView.classList.toggle("fullscreen");
  editorView.setAttribute("data-nf-state", editorView.classList.contains("fullscreen") ? "fullscreen" : "windowed");
  requestAnimationFrame(fitStageToContainer);
}
