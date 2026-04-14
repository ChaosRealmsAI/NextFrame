// Settings panel toggle helper for showing and hiding the settings overlay.
function toggleSettings() {
  document.getElementById("exports-overlay").classList.remove("show");
  document.getElementById("exports-panel").classList.remove("show");
  setElementState("exports-panel", "closed");

  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsPanel = document.getElementById("settings-panel");
  settingsOverlay.classList.toggle("show");
  settingsPanel.classList.toggle("show");
  settingsPanel.setAttribute("data-nf-state", settingsPanel.classList.contains("show") ? "open" : "closed");
}
