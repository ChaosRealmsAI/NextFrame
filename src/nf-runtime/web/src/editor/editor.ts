// Editor timeline and preview integration for the WKWebView editor.
// Two preview modes: 'dom' (scene-bundle real-time) or 'html' (load built HTML).
const ED_DEMO_TIMELINE_PATH = 'data/demo-timeline.json';

let edTimelineData: any = null;
let edActiveClip: any = null;
const editorClock = (seconds: any) => window.formatClock(seconds, true);

function getEditorLayerDuration(layer: any) {
  const dur = Number(layer && layer.dur);
  if (Number.isFinite(dur) && dur > 0) return dur;
  const legacyDuration = Number(layer && layer.duration);
  return Number.isFinite(legacyDuration) && legacyDuration > 0 ? legacyDuration : 0;
}

function normalizeEditorTimeline(timeline: any) {
  const source = timeline && typeof timeline === 'object' ? timeline : {};
  const rawLayers = Array.isArray(source.layers) ? source.layers : (Array.isArray(source.clips) ? source.clips : []);
  const layers = rawLayers.map(function(layer: any) {
    return Object.assign({}, layer, {
      start: Number.isFinite(layer && layer.start) ? layer.start : 0,
      dur: getEditorLayerDuration(layer),
    });
  });
  const duration = Number.isFinite(source.duration) && source.duration > 0
    ? source.duration
    : layers.reduce(function(maxEnd: any, layer: any) {
      return Math.max(maxEnd, layer.start + layer.dur);
    }, 0);

  return {
    width: source.width || (source.project && source.project.width) || 1920,
    height: source.height || (source.project && source.project.height) || 1080,
    fps: source.fps || (source.project && source.project.fps) || 30,
    duration: duration,
    layers: layers,
  };
}

function getEditorTimelineDuration() {
  if (!edTimelineData || !Array.isArray(edTimelineData.layers)) return 0;
  return edTimelineData.duration || edTimelineData.layers.reduce(function(maxEnd: any, layer: any) {
    return Math.max(maxEnd, layer.start + getEditorLayerDuration(layer));
  }, 0);
}

function updateEditorPreviewState(currentTime: any, totalDuration: any) {
  const time = Number.isFinite(currentTime) ? currentTime : 0;
  const duration = Number.isFinite(totalDuration) ? totalDuration : getEditorTimelineDuration();
  const previewTc = document.querySelector('.ed-preview-tc');
  if (previewTc) previewTc.textContent = editorClock(time) + ' / ' + editorClock(duration);
  const transportTc = document.querySelector('.ed-transport-tc');
  if (transportTc) transportTc.textContent = editorClock(time);
  const fill = document.querySelector('.ed-transport-fill');
  if (fill) {
    const pct = duration > 0 ? Math.max(0, Math.min(100, time / duration * 100)) : 0;
    fill.style.width = pct.toFixed(1) + '%';
  }
}

function toggleEditorPreviewPlaceholder(isVisible: any) {
  document.querySelectorAll('.ed-preview-gradient, .ed-play-btn').forEach(function(el) {
    el.style.display = isVisible ? '' : 'none';
  });
}

function ensureEditorPreviewStage() {
  const canvas = document.querySelector('.ed-preview-canvas');
  if (!canvas) return null;
  let stage = canvas.querySelector('#preview-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'preview-stage';
    stage.className = 'ed-preview-stage';
    stage.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;z-index:1;background:#05070b;';
    canvas.appendChild(stage);
  }
  return stage;
}

function clearEditorPreviewContent() {
  const stage = ensureEditorPreviewStage();
  if (stage) stage.innerHTML = '';
  window.edPreviewMode = 'none';
  toggleEditorPreviewPlaceholder(true);
}

function canUseDomPreview() {
  const engine = window.previewEngine;
  return !!(engine && typeof engine.setStage === 'function' &&
    typeof engine.loadTimeline === 'function' && typeof engine.compose === 'function');
}

function resetEditorSceneBundle() {
  window.__scenes = {};
  if (edSceneBundleScript && edSceneBundleScript.parentNode) {
    edSceneBundleScript.parentNode.removeChild(edSceneBundleScript);
  }
  edSceneBundleScript = null;
  edSceneBundleUrl = '';
}

function loadEditorSceneBundleScript(url: any) {
  return new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    script.dataset.nfPreviewBundle = 'true';
    script.onload = function() {
      edSceneBundleScript = script;
      edSceneBundleUrl = url;
      resolve();
    };
    script.onerror = function() {
      if (script.parentNode) script.parentNode.removeChild(script);
      edSceneBundleScript = null;
      edSceneBundleUrl = '';
      reject(new Error('Failed to load preview scene bundle'));
    };
    (document.head || document.body || document.documentElement).appendChild(script);
  });
}

async function ensureEditorSceneBundle(timeline: any) {
  const bundle = await bridgeCall('preview.bundle', { timeline: timeline });
  const url = bundle && bundle.url ? bundle.url : '';
  if (!url) throw new Error('Missing preview bundle URL');
  if (edSceneBundleUrl === url && window.__scenes && Object.keys(window.__scenes).length) {
    return bundle;
  }
  resetEditorSceneBundle();
  await loadEditorSceneBundleScript(url);
  return bundle;
}

function syncEditorTransportState(currentTime: any, isPlaying: any) {
  const state = {
    currentTime: Number.isFinite(currentTime) ? currentTime : 0,
    duration: getEditorTimelineDuration(),
    isPlaying: !!isPlaying,
  };
  if (typeof window.syncPreviewTransportState === 'function') {
    window.syncPreviewTransportState(state);
    return;
  }
  updateEditorPreviewState(state.currentTime, state.duration);
}

function resolveEditorSelectionIndex(selection: any) {
  if (typeof selection === 'number') return selection;
  if (!selection || !edTimelineData || !Array.isArray(edTimelineData.layers)) return null;
  const candidate = typeof selection.index === 'number' ? selection.index : null;
  if (candidate !== null) return candidate;
  const clipId = typeof selection === 'string'
    ? selection
    : (selection.id || selection.layerId || selection.sceneId || selection.scene || '');
  if (!clipId) return null;
  const index = edTimelineData.layers.findIndex(function(layer: any) {
    return [layer.id, layer.layerId, layer.sceneId, layer.scene, layer.name].includes(clipId);
  });
  return index >= 0 ? index : null;
}

function syncEditorSelectionUI(index: any) {
  document.querySelectorAll('.ed-tl-clip[data-index]').forEach(function(el) {
    el.classList.toggle('active', Number(el.dataset.index) === index);
  });
}

function bindEditorPreviewSelection() {
  if (!window.previewEngine) return;
  window.previewEngine.onSelect = function(selection: any) {
    const index = resolveEditorSelectionIndex(selection);
    if (index !== null) edSelectClip(index);
  };
}

function showEditorEmpty(message: any) {
  edTimelineData = null;
  edActiveClip = null;
  const rulerEl = document.getElementById('ed-tl-ruler2');
  const bodyEl = document.getElementById('ed-tl-body2');
  if (rulerEl) rulerEl.innerHTML = '';
  if (bodyEl) {
    bodyEl.innerHTML = '<div class="ed-tl-empty">' + (message || '暂无数据') + '</div>';
  }
  clearEditorPreviewContent();
  updateEditorPreviewState(0, 0);
  syncEditorSelectionUI(null);
}

function renderEditorTracks() {
  const rulerEl = document.getElementById('ed-tl-ruler2');
  const bodyEl = document.getElementById('ed-tl-body2');
  const duration = getEditorTimelineDuration();
  const layers = edTimelineData && Array.isArray(edTimelineData.layers) ? edTimelineData.layers : [];

  if (!bodyEl) return;
  if (!layers.length || duration <= 0) {
    if (rulerEl) rulerEl.innerHTML = '';
    bodyEl.innerHTML = '<div class="ed-tl-empty">暂无轨道</div>';
    return;
  }

  if (rulerEl) {
    const step = duration <= 20 ? 2 : (duration <= 40 ? 5 : 10);
    let rulerHtml = '';
    for (let t = 0; t <= duration; t += step) {
      const pct = (t / duration * 100).toFixed(1);
      rulerHtml += '<span class="ed-tl-ruler-mark" style="left:' + pct + '%">' + t + 's</span>';
      rulerHtml += '<span class="ed-tl-ruler-tick" style="left:' + pct + '%"></span>';
    }
    rulerEl.innerHTML = rulerHtml;
  }

  bodyEl.innerHTML = layers.map(function(layer: any, index: any) {
    const name = layer.scene || layer.name || ('Layer ' + (index + 1));
    const left = duration > 0 ? (layer.start / duration * 100) : 0;
    const width = duration > 0 ? (layer.dur / duration * 100) : 0;
    return '<div class="ed-tl-track">' +
      '<span class="ed-tl-track-label">' + escapeHtml(name) + '</span>' +
      '<div class="ed-tl-clip" data-index="' + index + '" data-start="' + layer.start + '" data-dur="' + layer.dur + '"' +
      ' style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%" onclick="handleTimelineTrackClick(event)">' +
      escapeHtml(name) +
      '</div>' +
      '</div>';
  }).join('');
  syncEditorSelectionUI(edActiveClip);
}

function renderEditorFromTimeline(timeline: any) {
  edTimelineData = normalizeEditorTimeline(timeline);
  edActiveClip = null;
  renderEditorTracks();
  updateEditorPreviewState(0, getEditorTimelineDuration());
  return edTimelineData;
}

function selectTimelineClip(index: any) {
  if (!edTimelineData || !Array.isArray(edTimelineData.layers) || !edTimelineData.layers[index]) return;
  edActiveClip = index;
  syncEditorSelectionUI(index);
  if (window.previewEngine && typeof window.previewEngine.select === 'function') {
    window.previewEngine.select(index);
  }
}

function previewFrame(time: any) {
  if (!canUseDomPreview()) return Promise.resolve(null);
  const safeTime = Math.max(0, Math.min(Number.isFinite(time) ? time : 0, getEditorTimelineDuration()));
  toggleEditorPreviewPlaceholder(false);
  const engine = window.previewEngine;
  const result = typeof engine.seek === 'function' ? engine.seek(safeTime) : engine.compose(safeTime);
  syncEditorTransportState(safeTime, false);
  return Promise.resolve(result);
}

function handleTimelineTrackClick(event: any) {
  const clipEl = event.target && event.target.closest ? event.target.closest('.ed-tl-clip[data-index]') : null;
  if (!clipEl || !edTimelineData) return;
  const index = Number(clipEl.dataset.index);
  const layer = edTimelineData.layers[index];
  if (!layer) return;
  edSelectClip(index);
  const rect = clipEl.getBoundingClientRect();
  const pct = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
  previewFrame(layer.start + layer.dur * pct);
}

function updatePreviewScale() {
  const canvas = document.querySelector('.ed-preview-canvas');
  const stage = document.getElementById('preview-stage');
  if (!canvas || !stage || !edTimelineData) return;
  const w = edTimelineData.width || 1920;
  const h = edTimelineData.height || 1080;
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  stage.style.transformOrigin = '0 0';
  stage.style.position = 'absolute';
  requestAnimationFrame(function() {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    const scale = Math.min(cw / w, ch / h);
    stage.style.transform = 'scale(' + scale + ')';
    stage.style.left = Math.round((cw - w * scale) / 2) + 'px';
    stage.style.top = Math.round((ch - h * scale) / 2) + 'px';
  });
}

async function composePreview() {
  if (!edTimelineData || !canUseDomPreview()) return null;
  if (!window.__scenes || !Object.keys(window.__scenes).length) {
    throw new Error('Preview scene bundle is not loaded');
  }
  const stage = ensureEditorPreviewStage();
  if (!stage) return null;
  stage.innerHTML = '';
  updatePreviewScale();
  window.previewEngine.setStage(stage);
  window.edPreviewMode = 'dom';
  window.previewEngine.loadTimeline(edTimelineData);
  bindEditorPreviewSelection();
  if (typeof window.bindPreviewStateSource === 'function') window.bindPreviewStateSource();
  toggleEditorPreviewPlaceholder(false);
  const result = window.previewEngine.compose(0);
  const engineState = typeof window.previewEngine.getState === 'function'
    ? window.previewEngine.getState()
    : { currentTime: 0, duration: getEditorTimelineDuration(), isPlaying: false };
  if (typeof window.syncPreviewTransportState === 'function') {
    window.syncPreviewTransportState(engineState);
  } else {
    updateEditorPreviewState(engineState.currentTime, engineState.duration);
  }
  return result;
}

async function loadEditorTimeline() {
  if (!canUseDomPreview()) {
    showEditorEmpty('DOM 预览引擎不可用');
    return null;
  }

  try {
    const response = await fetch(ED_DEMO_TIMELINE_PATH, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch demo timeline');
    const data = await response.json();
    renderEditorFromTimeline(data);
    await ensureEditorSceneBundle(data);
    await composePreview();
    return edTimelineData;
  } catch {
    showEditorEmpty('无法加载示例时间线');
    return null;
  }
}

function renderEditorClipList() {
  return null;
}

function renderEditorTimeline() {
  return document.getElementById('ed-tl-body2');
}

function renderEditorInspector() {
  return null;
}

function edSelectClip(idOrIndex: any) {
  const index = typeof idOrIndex === 'number' ? idOrIndex : resolveEditorSelectionIndex(idOrIndex);
  if (index === null) return;
  selectTimelineClip(index);
}

function edTimelineSeekFromX(clientX: any) {
  const tlEl = document.querySelector('.ed-timeline');
  if (!tlEl) return;
  const rect = tlEl.getBoundingClientRect();
  const labelArea = 100;
  const trackWidth = rect.width - labelArea;
  if (trackWidth <= 0) return;
  const pct = Math.max(0, Math.min(1, (clientX - rect.left - labelArea) / trackWidth));
  const time = pct * getEditorTimelineDuration();
  if (typeof window.sendPreviewCmd === 'function') window.sendPreviewCmd('seek', time);
  else previewFrame(time);
}

(function wireTimelineInteraction() {
  const ruler = document.getElementById('ed-tl-ruler2');
  if (ruler) ruler.addEventListener('click', function(e) { edTimelineSeekFromX(e.clientX); });
  const playhead = document.getElementById('ed-tl-playhead2');
  const hitArea = playhead ? playhead.querySelector('.ed-tl-playhead-hit') : null;
  if (hitArea) {
    let dragging = false;
    hitArea.addEventListener('pointerdown', function(e) { e.preventDefault(); dragging = true; hitArea.setPointerCapture(e.pointerId); });
    document.addEventListener('pointermove', function(e) { if (dragging) edTimelineSeekFromX(e.clientX); });
    document.addEventListener('pointerup', function() { dragging = false; });
  }
})();

window.__nfEditorDiagnose = function() {
  const engine = window.previewEngine;
  const scenes = window.__scenes || {};
  const stage = document.getElementById('preview-stage');
  const layers = edTimelineData && Array.isArray(edTimelineData.layers) ? edTimelineData.layers : [];
  const tracks = document.querySelectorAll('.ed-tl-track');
  const engineState = engine && typeof engine.getState === 'function' ? engine.getState() : null;
  return JSON.stringify({
    ready: !!(engine && Object.keys(scenes).length && stage),
    sceneCount: Object.keys(scenes).length,
    sceneIds: Object.keys(scenes),
    engineLoaded: !!engine,
    stagePresent: !!stage,
    stageChildren: stage ? stage.children.length : 0,
    timelineLoaded: !!edTimelineData,
    layerCount: layers.length,
    trackElements: tracks.length,
    duration: edTimelineData ? edTimelineData.duration : 0,
    previewMode: window.edPreviewMode || 'none',
    playbackState: engineState,
    activeClip: edActiveClip,
  }, null, 2);
};

window.addEventListener('resize', function() { updatePreviewScale(); });
window.loadEditorTimeline = loadEditorTimeline;
window.showEditorEmpty = showEditorEmpty;
window.renderEditorFromTimeline = renderEditorFromTimeline;
window.renderEditorClipList = renderEditorClipList;
window.renderEditorTimeline = renderEditorTimeline;
window.renderEditorInspector = renderEditorInspector;
window.edSelectClip = edSelectClip;
window.composePreview = composePreview;
window.previewFrame = previewFrame;
window.handleTimelineTrackClick = handleTimelineTrackClick;
window.updateEditorPreviewState = updateEditorPreviewState;
window.getEditorTimelineDuration = getEditorTimelineDuration;
