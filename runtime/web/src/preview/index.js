/* === preview/index.js === */
let _timelineScrubTarget = null;

function initPreviewSurface() {
  window.addEventListener("resize", fitStageToContainer);
}

async function previewComposed() {
  const segPath = getCurrentSegmentPath();
  if (!segPath) {
    setPreviewPlaceholder("PREVIEW", "Open a segment before composing");
    return;
  }

  const htmlPath = segPath.replace(/\.json$/i, ".html");
  setPlaybackState(false);

  try {
    await bridgeCall("compose.generate", {
      timelinePath: segPath,
      outputPath: htmlPath,
      open: true,
    }, IPC_COMPOSE_TIMEOUT_MS);
    requestPreviewFrame(currentTime);
  } catch (error) {
    console.error("[preview] compose failed", error);
    setText("canvas-title", "PREVIEW");
    setText("canvas-sub", getBridgeMessage(error));
  }
}
