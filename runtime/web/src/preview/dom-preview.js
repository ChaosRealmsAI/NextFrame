/* === preview/dom-preview.js === */
function getCurrentSegmentPath() {
  return currentSegmentPath || findSegmentEntry(currentSegment)?.path || null;
}

function stringifyClipParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return "No params";
  }
  const keys = Object.keys(params);
  return keys.length ? JSON.stringify(params, null, 2) : "No params";
}

function destroyDOMPreview() {
  if (previewStageHost && previewStageClickHandler) {
    previewStageHost.removeEventListener("click", previewStageClickHandler);
  }
  previewStageClickHandler = null;
  if (previewEngine && typeof previewEngine.destroy === "function") {
    try {
      previewEngine.destroy();
    } catch (error) {
      console.warn("[preview] destroy failed", error);
    }
  }
  previewEngine = null;
  previewTimeline = null;
  if (previewStageHost) {
    previewStageHost = null;
  }
  var wrapper = document.getElementById("preview-scale-wrapper");
  if (wrapper) {
    wrapper.remove();
  }
  window.__onFrame = null;
  window.__previewEngine = null;
}

function setPreviewPlaceholder(title, subtitle) {
  destroyDOMPreview();
  const placeholder = document.getElementById("preview-placeholder");
  if (placeholder) {
    placeholder.style.display = "flex";
  }
  setText("canvas-title", title || "TIMELINE");
  setText("canvas-sub", subtitle || "Load a timeline to preview");
}

function ensurePreviewInteractivity() {
  const stageRoot = document.getElementById("render-stage");
  if (!stageRoot) {
    return;
  }
  stageRoot.style.pointerEvents = "auto";
  stageRoot.querySelectorAll(".nf-layer").forEach(function(layer) {
    layer.style.pointerEvents = "auto";
  });
}

function fitStageToContainer() {
  var wrapper = document.getElementById("preview-scale-wrapper");
  var container = document.getElementById("canvas-inner");
  if (!container || !wrapper || !previewStageHost || !previewTimeline) {
    return;
  }
  var bounds = container.getBoundingClientRect();
  if (!(bounds.width > 0) || !(bounds.height > 0)) {
    return;
  }
  var stageW = previewTimeline.width;
  var stageH = previewTimeline.height;
  var scale = Math.min(bounds.width / stageW, bounds.height / stageH);
  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1;
  }
  var scaledW = Math.round(stageW * scale);
  var scaledH = Math.round(stageH * scale);
  wrapper.style.width = scaledW + "px";
  wrapper.style.height = scaledH + "px";
  wrapper.style.left = Math.round((bounds.width - scaledW) / 2) + "px";
  wrapper.style.top = Math.round((bounds.height - scaledH) / 2) + "px";
  previewStageHost.style.width = stageW + "px";
  previewStageHost.style.height = stageH + "px";
  previewStageHost.style.transformOrigin = "0 0";
  previewStageHost.style.transform = "scale(" + scale + ")";
}

function initDOMPreview(timeline) {
  if (!timeline) {
    destroyDOMPreview();
    return false;
  }

  var ev2 = window.__engineV2;
  if (!ev2 || !ev2.createEngine || !ev2.SCENE_REGISTRY) {
    console.warn("[preview] engine-v2 not loaded yet");
    return false;
  }

  destroyDOMPreview();

  var canvasInner = document.getElementById("canvas-inner");
  if (!canvasInner) {
    return false;
  }

  var placeholder = document.getElementById("preview-placeholder");
  if (placeholder) {
    placeholder.style.display = "none";
  }

  var iframe = document.getElementById("preview-iframe");
  if (iframe) {
    iframe.style.display = "none";
  }

  var wrapper = document.createElement("div");
  wrapper.id = "preview-scale-wrapper";
  wrapper.style.cssText = "position:absolute;overflow:hidden;";
  previewStageHost = document.createElement("div");
  previewStageHost.id = "preview-stage-host";
  previewStageHost.style.cssText = "position:absolute;left:0;top:0;";
  wrapper.appendChild(previewStageHost);
  canvasInner.appendChild(wrapper);

  var previewWidth = finiteNumber((timeline.project && timeline.project.width) || timeline.width, 1920);
  var previewHeight = finiteNumber((timeline.project && timeline.project.height) || timeline.height, 1080);
  previewTimeline = {
    width: previewWidth > 0 ? previewWidth : 1920,
    height: previewHeight > 0 ? previewHeight : 1080,
  };

  try {
    previewEngine = ev2.createEngine(previewStageHost, timeline, ev2.SCENE_REGISTRY);
    window.__previewEngine = previewEngine;
    previewEngine.renderFrame(Math.max(0, finiteNumber(currentTime, 0)));
    ensurePreviewInteractivity();
    fitStageToContainer();
  } catch (error) {
    console.error("[preview] createEngine failed", error);
    setPreviewPlaceholder("PREVIEW", "Engine error: " + (error.message || error));
    return false;
  }

  previewStageClickHandler = function(event) {
    var target = event.target.closest(".nf-layer > *") || event.target.closest(".nf-layer");
    if (target) {
      var layerId = target.dataset?.layerId || target.closest(".nf-layer")?.dataset?.layerId || "";
      var scene = target.dataset?.scene || "";
      updateInspectorFromIframe(layerId, scene, target);
    }
  };
  previewStageHost.addEventListener("click", previewStageClickHandler);

  return true;
}

function updateInspectorFromIframe(layerId, scene, element) {
  setText("insp-scene-name", scene || layerId || "Element");
  setText("insp-clip-id", layerId || "--");
  var paramsEl = document.getElementById("insp-params");
  if (paramsEl) {
    paramsEl.textContent = JSON.stringify({
      tag: element.tagName,
      text: (element.textContent || "").substring(0, 60),
      width: element.offsetWidth,
      height: element.offsetHeight,
    }, null, 2);
  }
}

function updateInspectorContext() {
  setReadout("insp-project", currentProject || "--");
  setReadout("insp-episode", currentEpisode || "--");
  setReadout("insp-segment", currentSegment || "--");
}

function requestPreviewFrame(t) {
  if (!currentTimeline) {
    return;
  }
  if ((!previewEngine || !previewStageHost || !previewTimeline) && !initDOMPreview(currentTimeline)) {
    return;
  }
  try {
    previewEngine.renderFrame(Math.max(0, finiteNumber(t, 0)));
    ensurePreviewInteractivity();
  } catch (error) {
    console.error("[preview] render failed", error);
    setPreviewPlaceholder("PREVIEW", error?.message || "Failed to render DOM preview");
  }
}

window.__onEngineV2Ready = function() {
  if (currentTimeline) {
    initDOMPreview(currentTimeline);
  }
};
