/* === editor.js === */
async function goEditor(project, episode, segment) {
  if (typeof project === "string") {
    currentProject = project || null;
  }
  if (typeof episode === "string") {
    currentEpisode = episode || null;
  }
  if (arguments.length >= 3) {
    currentSegment = (typeof segment === "string" && segment) ? segment : null;
  }

  stopWatching();
  previewReloadSeq += 1;
  setPlaybackState(false);
  currentSegmentPath = null;
  currentTimeline = null;
  currentSelectedClipId = null;
  destroyDOMPreview();
  segmentsCache = [];
  exportsCache = [];

  switchView("view-editor");
  updateInspectorContext();
  renderProjectDropdown();
  renderEpisodeDropdown();
  populateEditorClipSidebar();
  renderSegmentDropdown();
  renderExportsList([], currentEpisode ? "Loading exports..." : "Open an episode to view exports");

  if (!currentProject || !currentEpisode) {
    renderEditorNotice("Select an episode");
    return;
  }

  renderEditorNotice(currentSegment ? ("Loading " + currentSegment + "...") : "Loading timeline...");

  const requestId = ++editorLoadSeq;
  try {
    if (episodesCacheProject !== currentProject || !findEpisodeEntry(currentEpisode)) {
      const episodeResult = await bridgeCall("episode.list", { project: currentProject }, IPC_LOAD_TIMEOUT_MS);
      if (requestId !== editorLoadSeq) {
        return;
      }
      episodesCache = Array.isArray(episodeResult?.episodes) ? episodeResult.episodes : [];
      episodesCacheProject = currentProject;
      renderProjectDropdown();
      renderEpisodeDropdown();
    }

    const segmentResult = await bridgeCall("segment.list", {
      project: currentProject,
      episode: currentEpisode,
    }, IPC_LOAD_TIMEOUT_MS);
    if (requestId !== editorLoadSeq) {
      return;
    }

    segmentsCache = Array.isArray(segmentResult?.segments) ? segmentResult.segments : [];
    const selectedSegment = findSegmentEntry(currentSegment) || segmentsCache[0] || null;
    currentSegment = selectedSegment?.name || null;
    currentSegmentPath = selectedSegment?.path || null;

    updateInspectorContext();
    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();
    void refreshExportsPanel(requestId);

    if (!currentSegmentPath) {
      renderEditorNotice("No segments yet");
      return;
    }

    const timeline = await bridgeCall("timeline.load", { path: currentSegmentPath }, IPC_LOAD_TIMEOUT_MS);
    if (requestId !== editorLoadSeq) {
      return;
    }

    currentTimeline = timeline || {};
    renderTimeline(currentTimeline);
    initDOMPreview(currentTimeline);
    updateInspectorContext();
    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();
    startWatching(currentSegmentPath);
  } catch (error) {
    if (requestId !== editorLoadSeq) {
      return;
    }
    segmentsCache = [];
    currentSegment = null;
    currentSegmentPath = null;
    currentTimeline = null;
    currentSelectedClipId = null;
    destroyDOMPreview();
    exportsCache = [];
    updateInspectorContext();
    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();
    renderExportsList([], getBridgeMessage(error));
    renderEditorNotice(getBridgeMessage(error));
  }
}
