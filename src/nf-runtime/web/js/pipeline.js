function loadPipelineData() {
  if (typeof bridgeCall !== 'function') return;
  // Load segments for script/audio tabs
  if (currentEpisodePath) {
    bridgeCall('segment.list', { project: currentProjectPath, episode: currentEpisodePath }).then(function(data) {
      const segs = data.segments || [];
      renderScriptTab(segs);
      renderAudioTab(segs);
    }).catch(function(e) { console.error('[pipeline] segments:', e); });
  }
  // Load scenes for atoms tab
  bridgeCall('scene.list', {}).then(function(data) {
    renderAtomsTab(data.scenes || []);
  }).catch(function(e) { console.error('[pipeline] scenes:', e); });
  // Load export log for output tab
  // export.log needs a file path — try project's export log if exists
  var exportLogPath = currentProjectPath ? currentProjectPath + '/exports.json' : '';
  if (exportLogPath) {
    bridgeCall('fs.read', { path: exportLogPath }).then(function(data) {
      try { var parsed = JSON.parse(data.content || '[]'); renderOutputTab(Array.isArray(parsed) ? parsed : []); }
      catch(e2) { renderOutputTab([]); }
    }).catch(function() { renderOutputTab([]); });
  } else {
    renderOutputTab([]);
  }
}

function renderScriptTab(segments) {
  const el = document.querySelector('#pl-tab-script .pl-main');
  if (!el) return;
  if (segments.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无脚本段落</div>';
    return;
  }
  let html = '';
  segments.forEach(function(seg, i) {
    html += '<div class="glass" data-nf-action="generate-script" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--t100)">段落 ' + (i+1) + '</div>' +
      '<div style="font-size:12px;color:var(--t65);margin-top:4px">' + (seg.name || seg.path || '') + '</div>' +
    '</div>';
  });
  el.innerHTML = html;
}

function renderAudioTab(segments) {
  const el = document.querySelector('#pl-tab-audio .pl-main');
  if (!el) return;
  if (segments.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无音频数据</div>';
    return;
  }
  let html = '';
  segments.forEach(function(seg, i) {
    html += '<div class="glass" data-nf-action="play-audio" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--t100)">音频 ' + (i+1) + '</div>' +
      '<div style="font-size:12px;color:var(--t65);margin-top:4px">' + (seg.name || '') + '</div>' +
    '</div>';
  });
  el.innerHTML = html;
}

function renderAtomsTab(scenes) {
  const el = document.querySelector('#pl-tab-atom .pl-main');
  if (!el) return;
  if (scenes.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无场景组件</div>';
    return;
  }
  let html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px">';
  scenes.forEach(function(s) {
    const name = typeof s === 'string' ? s : (s.name || s.id || '');
    html += '<div class="glass" style="padding:14px;border-radius:10px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--t100)">' + name + '</div>' +
    '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function renderOutputTab(entries) {
  const el = document.querySelector('#pl-tab-output .pl-output-main');
  if (!el) return;
  if (entries.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无导出记录</div>';
    return;
  }
  let html = '';
  entries.forEach(function(e) {
    html += '<div class="glass" data-nf-action="export-video" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--t100)">' + (e.name || e.path || 'Export') + '</div>' +
      '<div style="font-size:12px;color:var(--t65);margin-top:4px">' + (e.status || '') + '</div>' +
    '</div>';
  });
  el.innerHTML = html;
}

// ══════════════════════════════════════
// EDITOR — Real timeline data

window.loadPipelineData = loadPipelineData;
window.renderScriptTab = renderScriptTab;
window.renderAudioTab = renderAudioTab;
window.renderAtomsTab = renderAtomsTab;
window.renderOutputTab = renderOutputTab;
