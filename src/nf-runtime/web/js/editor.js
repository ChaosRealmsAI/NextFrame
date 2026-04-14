let edTimelineData = null;
let edActiveClip = null;

function tagEditorControls() {
  document.querySelectorAll('.ed-play-btn, .ed-t-btn').forEach(function(el) {
    el.dataset.nfAction = 'preview';
  });
}

function loadEditorTimeline() {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath) {
    showEditorEmpty('选择一个剧集查看时间线');
    return;
  }
  // List files in episode dir to find segment-*.json or timeline.json
  bridgeCall('fs.listDir', { path: window.currentEpisodePath }).then(function(data) {
    var entries = data.entries || [];
    // Find first .json file that looks like a timeline (segment-*.json or timeline.json)
    var tlFile = entries.find(function(e) {
      return e.name && (e.name.startsWith('segment-') || e.name === 'timeline.json') && e.name.endsWith('.json');
    });
    if (!tlFile) {
      showEditorEmpty('暂无时间线文件');
      return;
    }
    var tlPath = window.currentEpisodePath + '/' + tlFile.name;
    return bridgeCall('timeline.load', { path: tlPath });
  }).then(function(data) {
    if (!data) return;
    edTimelineData = data;
    renderEditorFromTimeline(data);
  }).catch(function(e) {
    console.error('[editor] load timeline:', e);
    showEditorEmpty('暂无时间线数据');
  });
}

function showEditorEmpty(msg) {
  const el = document.getElementById('ed-clip-list2');
  if (el) el.innerHTML = '<div style="padding:20px;color:var(--t50);font-size:13px;text-align:center">' + (msg || '暂无数据') + '</div>';
  const tl = document.getElementById('ed-tl-body2');
  if (tl) tl.innerHTML = '';
  const insp = document.getElementById('ed-insp-inner2');
  if (insp) insp.innerHTML = '<div style="padding:20px;color:var(--t50);font-size:13px">选择一个片段查看参数</div>';
}

function renderEditorFromTimeline(tl) {
  const layers = tl.layers || tl.clips || [];
  const clipEl = document.getElementById('ed-clip-list2');
  const countEl = document.getElementById('ed-clip-count2');
  if (countEl) countEl.textContent = layers.length;
  if (clipEl) {
    let html = '';
    layers.forEach(function(layer, i) {
      const name = layer.scene || layer.name || ('Layer ' + (i + 1));
      const start = typeof layer.start === 'number' ? layer.start.toFixed(1) + 's' : (layer.start || '');
      const dur = typeof layer.duration === 'number' ? layer.duration.toFixed(1) + 's' : (layer.duration || '');
      html += '<div class="ed-clip-item" data-nf-action="select-clip" data-index="' + i + '" onclick="edSelectClip(' + i + ')">' +
        '<div class="ed-clip-top"><span class="ed-clip-name">' + name + '</span><span class="ed-clip-tc">' + start + '</span></div>' +
        '<div class="ed-clip-tags"><span class="ed-clip-tag dur">' + dur + '</span></div>' +
      '</div>';
    });
    clipEl.innerHTML = html;
  }
  const tlEl = document.getElementById('ed-tl-body2');
  if (tlEl && layers.length > 0) {
    const totalDur = tl.duration || layers.reduce(function(s, l) {
      return Math.max(s, (l.start || 0) + (l.duration || 0));
    }, 0);
    let html = '<div class="ed-tl-ruler"><div class="ed-tl-ruler-bg"></div>';
    for (let t = 0; t <= totalDur; t += 5) {
      html += '<span class="ed-tl-tick" style="left:' + (t / totalDur * 100).toFixed(1) + '%">' + t + 's</span>';
    }
    html += '</div>';
    layers.forEach(function(layer) {
      const name = layer.scene || layer.name || '';
      const left = totalDur > 0 ? ((layer.start || 0) / totalDur * 100) : 0;
      const width = totalDur > 0 ? ((layer.duration || 0) / totalDur * 100) : 0;
      html += '<div class="ed-tl-track"><span class="ed-tl-track-label">' + name + '</span><div class="ed-tl-track-clips">' +
        '<div class="ed-tl-clip ed-tl-clip--visual" data-nf-action="preview" style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"><span class="ed-tl-clip-label">' + name + '</span></div>' +
      '</div></div>';
    });
    tlEl.innerHTML = html;
  }
  showEditorEmpty();
}

function selectTimelineClip(index) {
  if (!edTimelineData) return;
  const layers = edTimelineData.layers || edTimelineData.clips || [];
  const layer = layers[index];
  if (!layer) return;
  edActiveClip = index;
  const insp = document.getElementById('ed-insp-inner2');
  if (!insp) return;
  let html = '<div style="padding:16px">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--t100);margin-bottom:12px">' + (layer.scene || layer.name || 'Clip') + '</div>';
  html += '<div style="font-size:12px;color:var(--t50);margin-bottom:16px">Layer ' + (index + 1) + '</div>';
  Object.keys(layer).forEach(function(key) {
    const val = layer[key];
    const display = typeof val === 'object' ? JSON.stringify(val).substring(0, 60) : String(val);
    html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">' +
      '<span style="font-size:12px;color:var(--t65)">' + key + '</span>' +
      '<span style="font-size:12px;font-family:var(--mono);color:var(--t80)">' + display + '</span>' +
    '</div>';
  });
  html += '</div>';
  insp.innerHTML = html;
}

function renderEditorClipList() {
  const el = document.getElementById('ed-clip-list');
  if (!el || typeof ED_CLIPS === 'undefined') return;
  let html = '';
  ED_CLIPS.forEach(function(c) {
    const isActive = c.id === edActiveClip;
    html += '<div class="ed-clip-item' + (isActive ? ' active' : '') + '" data-nf-action="select-clip" onclick="edSelectClip(\'' + c.id + '\')">' +
      '<div class="ed-clip-top">' +
        '<span class="ed-clip-name">' + c.name + '</span>' +
        '<span class="ed-clip-tc">' + c.tcIn + ' - ' + c.tcOut + '</span>' +
      '</div>' +
      '<div class="ed-clip-tags">' +
        '<span class="ed-clip-tag seg">' + c.seg + '</span>' +
        '<span class="ed-clip-tag dur">' + c.dur + '</span>' +
      '</div>' +
    '</div>';
  });
  el.innerHTML = html;
}

function renderEditorTimeline() {
  const el = document.getElementById('ed-tl-body');
  if (!el || typeof ED_TRACKS === 'undefined') return;
  const totalDur = 45.2;
  let html = '';

  html += '<div class="ed-tl-ruler">';
  html += '<div class="ed-tl-ruler-bg"></div>';
  for (let t = 0; t <= 45; t += 5) {
    const pct = (t / totalDur * 100).toFixed(1);
    html += '<span class="ed-tl-tick" style="left:' + pct + '%">' + t + 's</span>';
  }
  html += '<div class="ed-tl-playhead" style="left:31.8%;top:0;bottom:-' + (ED_TRACKS.length * 36 + 8) + 'px"></div>';
  html += '</div>';

  ED_TRACKS.forEach(function(track) {
    html += '<div class="ed-tl-track">';
    html += '<span class="ed-tl-track-label">' + track.name + '</span>';
    html += '<div class="ed-tl-track-lane">';
    track.clips.forEach(function(clip) {
      html += '<div class="ed-tl-clip ' + clip.color + '" data-nf-action="preview" style="left:' + clip.left + '%;width:' + clip.width + '%">' + clip.name + '</div>';
    });
    html += '</div></div>';
  });

  el.innerHTML = html;
}

function renderEditorInspector() {
  const el = document.getElementById('ed-insp-inner');
  if (!el || typeof ED_INSPECTOR === 'undefined') return;
  const data = ED_INSPECTOR[edActiveClip];
  if (!data) return;

  let html = '';
  html += '<div class="ed-insp-header">' +
    '<div class="ed-insp-name">' + data.name + '</div>' +
    '<div class="ed-insp-id">' + data.id + '</div>' +
  '</div>';

  html += '<div class="ed-insp-section">' +
    '<div class="ed-insp-section-title">CLIP</div>' +
    '<div class="ed-insp-row"><span class="ed-insp-label">Scene</span><span class="ed-insp-value accent">' + data.clip.scene + '</span></div>' +
    '<div class="ed-insp-row"><span class="ed-insp-label">Start</span><span class="ed-insp-value">' + data.clip.start + '</span></div>' +
    '<div class="ed-insp-row"><span class="ed-insp-label">Duration</span><span class="ed-insp-value">' + data.clip.duration + '</span></div>' +
    '<div class="ed-insp-row"><span class="ed-insp-label">Layer</span><span class="ed-insp-value">' + data.clip.layer + '</span></div>' +
  '</div>';

  html += '<div class="ed-insp-section"><div class="ed-insp-section-title">PARAMS</div>';
  const params = data.params;
  for (const key in params) {
    html += '<div class="ed-insp-row"><span class="ed-insp-label">' + key + '</span><span class="ed-insp-value">' + params[key] + '</span></div>';
  }
  html += '</div>';

  html += '<div class="ed-insp-section"><div class="ed-insp-section-title">POSITION</div>' +
    '<div class="ed-insp-row"><span class="ed-insp-label">x</span><input class="ed-insp-input" data-nf-action="save-timeline" value="' + data.position.x + '"></div>' +
    '<div class="ed-insp-row"><span class="ed-insp-label">y</span><input class="ed-insp-input" data-nf-action="save-timeline" value="' + data.position.y + '"></div>' +
    '<div class="ed-insp-row"><span class="ed-insp-label">width</span><input class="ed-insp-input" data-nf-action="save-timeline" value="' + data.position.width + '"></div>' +
    '<div class="ed-insp-row"><span class="ed-insp-label">height</span><input class="ed-insp-input" data-nf-action="save-timeline" value="' + data.position.height + '"></div>' +
  '</div>';

  html += '<div class="ed-insp-section">' +
    '<div class="ed-insp-section-title">FILE</div>' +
    '<div class="ed-insp-path">' + data.file + '</div>' +
  '</div>';

  el.innerHTML = html;
}

function edSelectClip(idOrIndex) {
  if (typeof idOrIndex === 'number' && edTimelineData) {
    selectTimelineClip(idOrIndex);
    return;
  }
  edActiveClip = idOrIndex;
  renderEditorClipList();
  renderEditorInspector();
}

tagEditorControls();

window.loadEditorTimeline = loadEditorTimeline;
window.showEditorEmpty = showEditorEmpty;
window.renderEditorFromTimeline = renderEditorFromTimeline;
window.renderEditorClipList = renderEditorClipList;
window.renderEditorTimeline = renderEditorTimeline;
window.renderEditorInspector = renderEditorInspector;
window.edSelectClip = edSelectClip;
