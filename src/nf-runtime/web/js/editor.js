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
  // Try pipeline.json first (real data), then timeline.json, then segment-*.json
  var pipelinePath = window.currentEpisodePath + '/pipeline.json';
  bridgeCall('fs.read', { path: pipelinePath }).then(function(data) {
    var raw = data.contents || data.content || '';
    var parsed;
    try { parsed = typeof raw === 'object' ? raw : JSON.parse(raw); }
    catch(pe) { parsed = {}; }
    var atoms = parsed.atoms || [];
    if (atoms.length > 0) {
      // Convert atoms to timeline-like format for rendering
      var totalDur = 0;
      var layers = atoms.map(function(a, i) {
        var start = totalDur;
        var dur = a.duration || 10;
        totalDur += dur;
        return {
          name: a.name || ('Atom ' + (i + 1)),
          scene: a.type || 'video',
          start: start,
          duration: dur,
          file: a.file || '',
          subtitles: a.subtitles ? a.subtitles.length + ' subs' : ''
        };
      });
      var tl = { layers: layers, duration: totalDur };
      edTimelineData = tl;
      renderEditorFromTimeline(tl);
      return;
    }
    // Fall back to looking for timeline/segment files
    return bridgeCall('fs.listDir', { path: window.currentEpisodePath });
  }).then(function(data) {
    if (!data || edTimelineData) return;
    var entries = data.entries || [];
    var tlFile = entries.find(function(e) {
      return e.name && (e.name === 'timeline.json' || e.name.startsWith('segment-')) && e.name.endsWith('.json');
    });
    if (!tlFile) {
      showEditorEmpty('暂无时间线数据');
      return;
    }
    var tlPath = window.currentEpisodePath + '/' + tlFile.name;
    return bridgeCall('timeline.load', { path: tlPath });
  }).then(function(data) {
    if (!data || edTimelineData) return;
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
  // Set inspector to default "select a clip" state
  const insp = document.getElementById('ed-insp-inner2');
  if (insp) insp.innerHTML = '<div style="padding:20px;color:var(--t50);font-size:13px">选择一个片段查看参数</div>';
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
  const editableKeys = ['name', 'start', 'duration'];
  Object.keys(layer).forEach(function(key) {
    const val = layer[key];
    const isEditable = editableKeys.indexOf(key) >= 0;
    if (typeof val === 'object') {
      const display = JSON.stringify(val).substring(0, 60);
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:12px;color:var(--t65)">' + key + '</span>' +
        '<span style="font-size:12px;font-family:var(--mono);color:var(--t80)">' + display + '</span></div>';
    } else if (isEditable) {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:12px;color:var(--t65)">' + key + '</span>' +
        '<input class="ed-insp-input" data-nf-action="edit-clip-param" data-key="' + key + '" data-index="' + index + '" value="' + String(val) + '" onchange="edSaveParam(this)" style="width:80px;text-align:right">' +
      '</div>';
    } else {
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:12px;color:var(--t65)">' + key + '</span>' +
        '<span style="font-size:12px;font-family:var(--mono);color:var(--t80)">' + String(val) + '</span></div>';
    }
  });
  html += '<div style="margin-top:12px"><button class="btn-sm" data-nf-action="compose-preview" onclick="composePreview()" style="font-size:12px;padding:4px 12px;background:var(--accent);color:#000;border:none;border-radius:6px;cursor:pointer">合成预览</button></div>';
  html += '</div>';
  insp.innerHTML = html;
}

function edSaveParam(input) {
  const idx = parseInt(input.dataset.index);
  const key = input.dataset.key;
  if (!edTimelineData) return;
  const layers = edTimelineData.layers || [];
  if (!layers[idx]) return;
  const newVal = isNaN(Number(input.value)) ? input.value : Number(input.value);
  layers[idx][key] = newVal;
  saveTimeline();
}

function saveTimeline() {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath || !edTimelineData) return;
  const path = window.currentEpisodePath + '/timeline.json';
  bridgeCall('timeline.save', { path: path, timeline: edTimelineData }).then(function() {
    const insp = document.getElementById('ed-insp-inner2');
    if (!insp) return;
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
    setTimeout(function() { badge.style.opacity = '0'; }, 2000);
  }).catch(function(e) {
    console.error('[editor] save timeline:', e);
  });
}

function composePreview() {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath || !edTimelineData) return;
  const path = window.currentEpisodePath + '/timeline.json';
  const preview = document.querySelector('.ed-preview');
  if (preview) {
    preview.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">合成中...</div>';
  }
  bridgeCall('timeline.save', { path: path, timeline: edTimelineData }).then(function() {
    return bridgeCall('compose.generate', { timelinePath: path });
  }).then(function(data) {
    if (!preview || !data.path) return;
    const htmlPath = data.path.replace(/^.*\/projects\//, '');
    preview.innerHTML = '<iframe src="nfdata://localhost/' + htmlPath + '" style="width:100%;height:100%;border:none;background:#000"></iframe>';
  }).catch(function(e) {
    console.error('[editor] compose:', e);
    if (preview) preview.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--warm)">合成失败: ' + (e.message || e) + '</div>';
  });
}

function previewFrame(t) {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath) return;
  const path = window.currentEpisodePath + '/timeline.json';
  bridgeCall('preview.frame', { timelinePath: path, t: t }).then(function(data) {
    if (!data.dataUrl) return;
    const preview = document.querySelector('.ed-preview');
    if (preview) {
      preview.innerHTML = '<img src="' + data.dataUrl + '" style="width:100%;height:100%;object-fit:contain">';
    }
  }).catch(function(e) {
    console.error('[editor] preview frame:', e);
  });
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

// Timeline click → preview frame at that time position
document.addEventListener('click', function(e) {
  const track = e.target.closest('.ed-tl-track-clips');
  if (!track || !edTimelineData) return;
  const rect = track.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const totalDur = edTimelineData.duration || 0;
  if (totalDur > 0) {
    previewFrame(pct * totalDur);
  }
});

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
