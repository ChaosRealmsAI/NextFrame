// Editor timeline and preview integration for the WKWebView editor.
let edTimelineData = null;
let edActiveClip = null;

function buildEditorTimelinePath() {
  return window.currentEpisodePath + '/timeline.json';
}

function normalizeEditorTimeline(timeline) {
  if (!timeline || typeof timeline !== 'object') {
    return timeline;
  }
  if (!Array.isArray(timeline.layers)) {
    timeline.layers = Array.isArray(timeline.clips) ? timeline.clips : [];
  }
  if (typeof timeline.duration !== 'number') {
    timeline.duration = timeline.layers.reduce(function(maxEnd, layer) {
      return Math.max(maxEnd, (layer.start || 0) + (layer.duration || 0));
    }, 0);
  }
  return timeline;
}

function getEditorTimelineDuration() {
  if (!edTimelineData || !Array.isArray(edTimelineData.layers)) {
    return 0;
  }
  return edTimelineData.duration || edTimelineData.layers.reduce(function(maxEnd, layer) {
    return Math.max(maxEnd, (layer.start || 0) + (layer.duration || 0));
  }, 0);
}

function formatEditorTimecode(seconds) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = (safeSeconds - minutes * 60).toFixed(1).padStart(4, '0');
  return String(minutes).padStart(2, '0') + ':' + remainder;
}

function updateEditorPreviewState(t, totalDuration) {
  const previewTc = document.querySelector('.ed-preview-tc');
  if (previewTc) {
    previewTc.textContent = formatEditorTimecode(t) + ' / ' + formatEditorTimecode(totalDuration);
  }
  const transportTc = document.querySelector('.ed-transport-tc');
  if (transportTc) {
    transportTc.textContent = formatEditorTimecode(t);
  }
  const progressFill = document.querySelector('.ed-transport-fill');
  if (progressFill) {
    const pct = totalDuration > 0 ? Math.max(0, Math.min(100, t / totalDuration * 100)) : 0;
    progressFill.style.width = pct.toFixed(1) + '%';
  }
}

function toggleEditorPreviewPlaceholder(isVisible) {
  document.querySelectorAll('.ed-preview-gradient, .ed-play-btn').forEach(function(el) {
    el.style.display = isVisible ? '' : 'none';
  });
}

function ensureEditorPreviewHost() {
  const canvas = document.querySelector('.ed-preview-canvas');
  if (!canvas) {
    return null;
  }
  let host = canvas.querySelector('.ed-preview');
  if (!host) {
    host = document.createElement('div');
    host.className = 'ed-preview';
    host.style.position = 'absolute';
    host.style.inset = '0';
    host.style.zIndex = '1';
    host.style.background = '#05070b';
    canvas.appendChild(host);
  }
  return host;
}

function renderEditorPreviewContent(tagName, configure) {
  const host = ensureEditorPreviewHost();
  if (!host) {
    return null;
  }
  host.innerHTML = '';
  const el = document.createElement(tagName);
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.display = 'block';
  el.style.border = '0';
  el.style.objectFit = 'contain';
  configure(el);
  host.appendChild(el);
  toggleEditorPreviewPlaceholder(false);
  return el;
}

function clearEditorPreviewContent() {
  const host = document.querySelector('.ed-preview');
  if (host) {
    host.innerHTML = '';
  }
  toggleEditorPreviewPlaceholder(true);
}

function toEditorPreviewUrl(path) {
  if (!path) {
    return '';
  }
  if (/^(https?:|file:|data:)/.test(path)) {
    return path;
  }
  return encodeURI('file://' + path);
}

function showEditorPreviewFrame(dataUrl) {
  renderEditorPreviewContent('img', function(img) {
    img.src = dataUrl;
    img.alt = 'Timeline preview frame';
  });
}

function showEditorComposePreview(path) {
  renderEditorPreviewContent('iframe', function(frame) {
    frame.src = toEditorPreviewUrl(path);
    frame.title = 'Composed preview';
    frame.allow = 'autoplay';
  });
}

function escapeEditorAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseEditorInputValue(rawValue, currentValue) {
  if (typeof currentValue === 'number') {
    const numericValue = Number(rawValue);
    return Number.isNaN(numericValue) ? rawValue : numericValue;
  }
  if (typeof currentValue === 'boolean') {
    return rawValue === 'true';
  }
  if (currentValue && typeof currentValue === 'object') {
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return rawValue;
    }
  }
  return rawValue;
}

function saveTimeline() {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath || !edTimelineData) {
    return Promise.resolve(null);
  }
  return bridgeCall('timeline.save', {
    path: buildEditorTimelinePath(),
    timeline: edTimelineData
  });
}

function showEditorSaveBadge() {
  const insp = document.getElementById('ed-insp-inner2');
  if (!insp) {
    return;
  }
  let badge = document.getElementById('ed-save-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'ed-save-badge';
    badge.style.cssText = 'position:absolute;top:8px;right:8px;font-size:11px;color:var(--green);opacity:1;transition:opacity 0.5s';
    insp.style.position = 'relative';
    insp.appendChild(badge);
  }
  badge.textContent = '已保存';
  badge.style.opacity = '1';
  setTimeout(function() {
    badge.style.opacity = '0';
  }, 2000);
}

function ensureComposePreviewButton() {
  const btnRow = document.querySelector('.ed-transport-btns');
  if (!btnRow || btnRow.querySelector('[data-nf-action="compose-preview"]')) {
    return;
  }
  const button = document.createElement('button');
  button.className = 'ed-t-btn';
  button.type = 'button';
  button.dataset.nfAction = 'compose-preview';
  button.textContent = 'PREVIEW';
  button.style.width = 'auto';
  button.style.padding = '0 12px';
  button.onclick = function() {
    window.composePreview();
  };
  btnRow.appendChild(button);
}

function tagEditorControls() {
  document.querySelectorAll('.ed-play-btn, .ed-t-btn:not([data-nf-action="compose-preview"])').forEach(function(el) {
    el.dataset.nfAction = 'preview';
  });
  ensureComposePreviewButton();
}

async function loadEditorTimeline() {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath) {
    showEditorEmpty('选择一个剧集查看时间线');
    return;
  }
  const pipelinePath = window.currentEpisodePath + '/pipeline.json';
  try {
    let parsed = {};
    try {
      const pipelineData = await bridgeCall('fs.read', { path: pipelinePath });
      const raw = pipelineData.contents || pipelineData.content || '';
      parsed = typeof raw === 'object' ? raw : JSON.parse(raw);
    } catch (error) {
      parsed = {};
    }
    const atoms = parsed.atoms || [];
    if (atoms.length > 0) {
      let totalDuration = 0;
      const layers = atoms.map(function(atom, index) {
        const start = totalDuration;
        const duration = atom.duration || 10;
        totalDuration += duration;
        return {
          name: atom.name || ('Atom ' + (index + 1)),
          scene: atom.type || 'video',
          start: start,
          duration: duration,
          file: atom.file || '',
          subtitles: atom.subtitles ? atom.subtitles.length + ' subs' : ''
        };
      });
      edTimelineData = normalizeEditorTimeline({ layers: layers, duration: totalDuration });
      renderEditorFromTimeline(edTimelineData);
      return;
    }
    const dirData = await bridgeCall('fs.listDir', { path: window.currentEpisodePath });
    const entries = dirData.entries || dirData || [];
    const timelineEntry = entries.find(function(entry) {
      const name = typeof entry === 'string' ? entry : entry.name;
      return name && (name === 'timeline.json' || name.startsWith('segment-')) && name.endsWith('.json');
    });
    const timelineName = timelineEntry ? (typeof timelineEntry === 'string' ? timelineEntry : timelineEntry.name) : '';
    if (!timelineName) {
      showEditorEmpty('暂无时间线数据');
      return;
    }
    const timelineData = await bridgeCall('timeline.load', {
      path: window.currentEpisodePath + '/' + timelineName
    });
    edTimelineData = normalizeEditorTimeline(timelineData);
    renderEditorFromTimeline(edTimelineData);
  } catch (error) {
    console.error('[editor] load timeline:', error);
    showEditorEmpty('暂无时间线数据');
  }
}

function showEditorEmpty(msg) {
  const clipList = document.getElementById('ed-clip-list2');
  if (clipList) {
    clipList.innerHTML = '<div style="padding:20px;color:var(--t50);font-size:13px;text-align:center">' + (msg || '暂无数据') + '</div>';
  }
  const tl = document.getElementById('ed-tl-body2');
  if (tl) {
    tl.innerHTML = '';
  }
  const insp = document.getElementById('ed-insp-inner2');
  if (insp) {
    insp.innerHTML = '<div style="padding:20px;color:var(--t50);font-size:13px">选择一个片段查看参数</div>';
  }
  clearEditorPreviewContent();
  updateEditorPreviewState(0, 0);
}

function renderEditorFromTimeline(tl) {
  const timeline = normalizeEditorTimeline(tl);
  const layers = timeline.layers || [];
  const clipEl = document.getElementById('ed-clip-list2');
  const countEl = document.getElementById('ed-clip-count2');
  if (countEl) {
    countEl.textContent = layers.length;
  }
  if (clipEl) {
    let html = '';
    layers.forEach(function(layer, i) {
      const name = layer.scene || layer.name || ('Layer ' + (i + 1));
      const start = typeof layer.start === 'number' ? layer.start.toFixed(1) + 's' : (layer.start || '');
      const duration = typeof layer.duration === 'number' ? layer.duration.toFixed(1) + 's' : (layer.duration || '');
      html += '<div class="ed-clip-item" data-nf-action="select-clip" data-index="' + i + '" onclick="edSelectClip(' + i + ')">' +
        '<div class="ed-clip-top"><span class="ed-clip-name">' + name + '</span><span class="ed-clip-tc">' + start + '</span></div>' +
        '<div class="ed-clip-tags"><span class="ed-clip-tag dur">' + duration + '</span></div>' +
      '</div>';
    });
    clipEl.innerHTML = html;
  }
  const tlEl = document.getElementById('ed-tl-body2');
  if (tlEl && layers.length > 0) {
    const totalDuration = timeline.duration || layers.reduce(function(maxEnd, layer) {
      return Math.max(maxEnd, (layer.start || 0) + (layer.duration || 0));
    }, 0);
    let html = '<div class="ed-tl-ruler"><div class="ed-tl-ruler-bg"></div>';
    for (let t = 0; t <= totalDuration; t += 5) {
      html += '<span class="ed-tl-tick" style="left:' + (t / totalDuration * 100).toFixed(1) + '%">' + t + 's</span>';
    }
    html += '</div>';
    layers.forEach(function(layer) {
      const name = layer.scene || layer.name || '';
      const left = totalDuration > 0 ? ((layer.start || 0) / totalDuration * 100) : 0;
      const width = totalDuration > 0 ? ((layer.duration || 0) / totalDuration * 100) : 0;
      html += '<div class="ed-tl-track"><span class="ed-tl-track-label">' + name + '</span><div class="ed-tl-track-clips" onclick="handleTimelineTrackClick(event)">' +
        '<div class="ed-tl-clip ed-tl-clip--visual" data-nf-action="preview" style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"><span class="ed-tl-clip-label">' + name + '</span></div>' +
      '</div></div>';
    });
    tlEl.innerHTML = html;
  }
  const insp = document.getElementById('ed-insp-inner2');
  if (insp) {
    insp.innerHTML = '<div style="padding:20px;color:var(--t50);font-size:13px">选择一个片段查看参数</div>';
  }
  updateEditorPreviewState(0, getEditorTimelineDuration());
}

function selectTimelineClip(index) {
  if (!edTimelineData || !Array.isArray(edTimelineData.layers)) {
    return;
  }
  const layer = edTimelineData.layers[index];
  if (!layer) {
    return;
  }
  edActiveClip = index;
  const insp = document.getElementById('ed-insp-inner2');
  if (!insp) {
    return;
  }
  let html = '<div style="padding:16px">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--t100);margin-bottom:12px">' + (layer.scene || layer.name || 'Clip') + '</div>';
  html += '<div style="font-size:12px;color:var(--t50);margin-bottom:16px">Layer ' + (index + 1) + '</div>';
  Object.keys(layer).forEach(function(key) {
    const value = typeof layer[key] === 'object' ? JSON.stringify(layer[key]) : String(layer[key]);
    html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 0;border-bottom:1px solid var(--border)">' +
      '<span style="font-size:12px;color:var(--t65)">' + key + '</span>' +
      '<input class="ed-insp-input" data-nf-action="save-timeline" data-key="' + escapeEditorAttr(key) + '" value="' + escapeEditorAttr(value) + '" style="width:180px;text-align:right">' +
    '</div>';
  });
  html += '</div>';
  insp.innerHTML = html;
  insp.querySelectorAll('.ed-insp-input[data-key]').forEach(function(input) {
    input.onchange = function(event) {
      handleTimelineInspectorChange(event);
    };
  });
}

function handleTimelineInspectorChange(event) {
  if (!edTimelineData || !Array.isArray(edTimelineData.layers) || edActiveClip === null) {
    return;
  }
  const input = event.currentTarget;
  const key = input.dataset.key;
  const layer = edTimelineData.layers[edActiveClip];
  if (!key || !layer) {
    return;
  }
  layer[key] = parseEditorInputValue(input.value, layer[key]);
  edTimelineData.duration = edTimelineData.layers.reduce(function(maxEnd, item) {
    return Math.max(maxEnd, (item.start || 0) + (item.duration || 0));
  }, 0);
  saveTimeline().then(function() {
    showEditorSaveBadge();
    renderEditorFromTimeline(edTimelineData);
    selectTimelineClip(edActiveClip);
  }).catch(function(error) {
    console.error('[editor] save timeline:', error);
  });
}

function edSaveParam(input) {
  handleTimelineInspectorChange({ currentTarget: input });
}

function previewFrame(t) {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath) {
    return Promise.resolve(null);
  }
  return bridgeCall('preview.frame', {
    timelinePath: buildEditorTimelinePath(),
    t: t
  }).then(function(result) {
    if (!result || !result.dataUrl) {
      return result;
    }
    showEditorPreviewFrame(result.dataUrl);
    updateEditorPreviewState(t, getEditorTimelineDuration());
    return result;
  }).catch(function(error) {
    console.error('[editor] preview frame:', error);
    return null;
  });
}

function handleTimelineTrackClick(event) {
  const track = event.currentTarget || event.target.closest('.ed-tl-track-clips');
  if (!track || !edTimelineData) {
    return;
  }
  const totalDuration = getEditorTimelineDuration();
  if (!track.clientWidth || totalDuration <= 0) {
    return;
  }
  const offsetX = event.target === track ? event.offsetX : event.clientX - track.getBoundingClientRect().left;
  const t = Math.max(0, Math.min(totalDuration, offsetX / track.clientWidth * totalDuration));
  previewFrame(t);
}

async function composePreview() {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath || !edTimelineData) {
    return null;
  }
  await bridgeCall('timeline.save', {
    path: buildEditorTimelinePath(),
    timeline: edTimelineData
  });
  const result = await bridgeCall('compose.generate', {
    timelinePath: buildEditorTimelinePath(),
    open: true
  });
  if (result && result.path) {
    updateEditorPreviewState(0, getEditorTimelineDuration());
  }
  return result;
}

function renderEditorClipList() {
  return document.getElementById('ed-clip-list');
}

function renderEditorTimeline() {
  return document.getElementById('ed-tl-body');
}

function renderEditorInspector() {
  return document.getElementById('ed-insp-inner');
}

function edSelectClip(idOrIndex) {
  if (typeof idOrIndex === 'number' && edTimelineData) {
    selectTimelineClip(idOrIndex);
    return;
  }
  edActiveClip = idOrIndex;
}

tagEditorControls();

window.loadEditorTimeline = loadEditorTimeline;
window.showEditorEmpty = showEditorEmpty;
window.renderEditorFromTimeline = renderEditorFromTimeline;
window.renderEditorClipList = renderEditorClipList;
window.renderEditorTimeline = renderEditorTimeline;
window.renderEditorInspector = renderEditorInspector;
window.edSelectClip = edSelectClip;
window.edSaveParam = edSaveParam;
window.saveTimeline = saveTimeline;
window.composePreview = composePreview;
window.previewFrame = previewFrame;
window.handleTimelineTrackClick = handleTimelineTrackClick;
window.handleTimelineInspectorChange = handleTimelineInspectorChange;
