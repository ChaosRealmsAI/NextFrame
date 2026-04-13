/* === app.js === */
function switchView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  if (id !== "view-editor") {
    stopWatching();
    setPlaybackState(false);
    destroyDOMPreview();
  }
  target.classList.add("active");
  target.classList.add("view-transition-enter");
  restartStaggerAnimations(target);
  setTimeout(() => target.classList.remove("view-transition-enter"), 500);
  closeAllDropdowns();
  if (id === "view-home") {
    void initHome();
  }
}

function goHome() {
  switchView("view-home");
}
