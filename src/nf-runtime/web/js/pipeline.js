// Pipeline runtime bindings.
let pipelineRenderEntries = [];
let pipelinePreviewState = {};
let pipelineExportState = null;
let pipelineExportPollTimer = null;
let pipelineEpisodeScope = '';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function resetPipelineEpisodeState() {
  pipelinePreviewState = {};
  pipelineExportState = null;
  stopExportPolling();
}

function stopExportPolling() {
  if (!pipelineExportPollTimer) return;
  window.clearTimeout(pipelineExportPollTimer);
  pipelineExportPollTimer = null;
}

function scheduleExportPolling(delayMs) {
  stopExportPolling();
  pipelineExportPollTimer = window.setTimeout(function() {
    pollExportStatus();
  }, delayMs);
}

function getCurrentProjectRef() {
  return window.currentProjectPath || '';
}

function getCurrentEpisodeRef() {
  return window.currentEpisodePath || '';
}

function getProjectNameFromPath() {
  const path = getCurrentProjectRef().replace(/\/+$/, '');
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function getEpisodeNameFromPath() {
  const path = getCurrentEpisodeRef().replace(/\/+$/, '');
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function formatExportPercent(percent) {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return '0%';
  return Math.max(0, Math.min(100, percent)).toFixed(1) + '%';
}

function formatExportEta(eta) {
  if (typeof eta !== 'number' || Number.isNaN(eta) || eta <= 0) return '--';
  if (eta < 60) return Math.round(eta) + 's';
  const mins = Math.floor(eta / 60);
  const secs = Math.round(eta % 60);
  return mins + 'm ' + secs + 's';
}

function renderScriptPreview(state) {
  if (!state) return '';
  if (state.loading) {
    return '<div style="margin-top:12px;font-size:12px;color:var(--t65)">正在加载视频预览...</div>';
  }
  if (state.error) {
    return '<div style="margin-top:12px;font-size:12px;color:#ff8f8f">' + escapeHtml(state.error) + '</div>';
  }
  if (state.exists && state.path) {
    return '<video controls preload="metadata" style="width:100%;margin-top:12px;border-radius:10px;background:#000" src="' + escapeHtml(state.path) + '"></video>';
  }
  return '<div style="margin-top:12px;font-size:12px;color:var(--t65)">该段暂无视频文件</div>';
}

function renderOutputProgressCard() {
  if (!pipelineExportState) return '';
  const state = pipelineExportState.state || 'running';
  const percent = typeof pipelineExportState.percent === 'number' ? pipelineExportState.percent : 0;
  const barWidth = Math.max(0, Math.min(100, percent));
  const statusColor = state === 'failed' ? '#ff8f8f' : (state === 'done' ? 'var(--green)' : 'var(--t100)');
  const errorHtml = pipelineExportState.error
    ? '<div style="font-size:12px;color:#ff8f8f;margin-top:8px">' + escapeHtml(pipelineExportState.error) + '</div>'
    : '';
  const cancelButton = state === 'running' || state === 'queued'
    ? '<button data-nf-action="export-cancel" onclick="cancelPipelineExport()" style="border:0;border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.08);color:var(--t100);cursor:pointer">取消</button>'
    : '';
  return '' +
    '<div class="glass" style="padding:16px;margin-bottom:12px;border-radius:12px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
        '<div>' +
          '<div style="font-size:14px;font-weight:600;color:' + statusColor + '">导出状态: ' + escapeHtml(state) + '</div>' +
          '<div style="font-size:12px;color:var(--t65);margin-top:4px">进度 ' + escapeHtml(formatExportPercent(percent)) + ' · ETA ' + escapeHtml(formatExportEta(pipelineExportState.eta)) + '</div>' +
        '</div>' +
        cancelButton +
      '</div>' +
      '<div style="height:8px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;margin-top:12px">' +
        '<div style="height:100%;width:' + barWidth.toFixed(1) + '%;background:linear-gradient(90deg,#34d399,#60a5fa)"></div>' +
      '</div>' +
      (pipelineExportState.logPath ? '<div style="font-family:var(--mono);font-size:11px;color:var(--t50);margin-top:8px">' + escapeHtml(pipelineExportState.logPath) + '</div>' : '') +
      errorHtml +
    '</div>';
}

function normalizeSegmentPreviewParams(segmentName) {
  return {
    project: getCurrentProjectRef(),
    episode: getCurrentEpisodeRef(),
    segment: segmentName,
  };
}

function fallbackSegmentPreviewParams(segmentName) {
  return {
    project: getProjectNameFromPath(),
    episode: getEpisodeNameFromPath(),
    segment: segmentName,
  };
}

function loadPipelineData() {
  if (typeof bridgeCall !== 'function') return;

  const nextScope = getCurrentEpisodeRef();
  if (pipelineEpisodeScope !== nextScope) {
    pipelineEpisodeScope = nextScope;
    resetPipelineEpisodeState();
  }

  if (getCurrentEpisodeRef()) {
    bridgeCall('segment.list', { project: getCurrentProjectRef(), episode: getCurrentEpisodeRef() }).then(function(data) {
      const segs = data.segments || [];
      renderScriptTab(segs);
      renderAudioTab(segs);
    }).catch(function(error) {
      console.error('[pipeline] segments:', error);
    });
  }

  bridgeCall('scene.list', {}).then(function(data) {
    renderAtomsTab(data.scenes || []);
  }).catch(function(error) {
    console.error('[pipeline] scenes:', error);
  });

  const exportLogPath = getCurrentProjectRef() ? getCurrentProjectRef() + '/exports.json' : '';
  if (exportLogPath) {
    bridgeCall('fs.read', { path: exportLogPath }).then(function(data) {
      try {
        const parsed = JSON.parse(data.contents || data.content || '[]');
        renderOutputTab(Array.isArray(parsed) ? parsed : []);
      } catch (_error) {
        renderOutputTab([]);
      }
    }).catch(function() {
      renderOutputTab([]);
    });
    return;
  }

  renderOutputTab([]);
}

function renderScriptTab(segments) {
  pipelineRenderEntries = pipelineRenderEntries;
  const el = document.querySelector('#pl-tab-script .pl-main');
  if (!el) return;
  if (segments.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无脚本段落</div>';
    return;
  }

  let html = '';
  segments.forEach(function(seg, index) {
    const segmentName = seg.name || seg.path || '';
    const preview = pipelinePreviewState[segmentName];
    html += '' +
      '<div class="glass" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:600;color:var(--t100)">段落 ' + (index + 1) + '</div>' +
            '<div style="font-size:12px;color:var(--t65);margin-top:4px">' + escapeHtml(segmentName) + '</div>' +
          '</div>' +
          '<button data-nf-action="preview-segment" onclick="previewSegmentVideo(\'' + escapeJsString(segmentName) + '\')" style="border:0;border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.08);color:var(--t100);cursor:pointer">预览视频</button>' +
        '</div>' +
        renderScriptPreview(preview) +
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
  segments.forEach(function(seg, index) {
    html += '<div class="glass" data-nf-action="play-audio" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--t100)">音频 ' + (index + 1) + '</div>' +
      '<div style="font-size:12px;color:var(--t65);margin-top:4px">' + escapeHtml(seg.name || '') + '</div>' +
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
  scenes.forEach(function(scene) {
    const name = typeof scene === 'string' ? scene : (scene.name || scene.id || '');
    html += '<div class="glass" style="padding:14px;border-radius:10px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--t100)">' + escapeHtml(name) + '</div>' +
    '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function renderOutputEntries(entries) {
  if (entries.length === 0) {
    return '<div style="display:flex;align-items:center;justify-content:center;min-height:180px;color:var(--t50)">暂无导出记录</div>';
  }

  let html = '';
  entries.forEach(function(entry) {
    html += '<div class="glass" data-nf-action="export-video" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--t100)">' + escapeHtml(entry.name || entry.path || 'Export') + '</div>' +
      '<div style="font-size:12px;color:var(--t65);margin-top:4px">' + escapeHtml(entry.status || '') + '</div>' +
    '</div>';
  });
  return html;
}

function renderOutputTab(entries) {
  pipelineRenderEntries = entries;
  const el = document.querySelector('#pl-tab-output .pl-output-main');
  if (!el) return;
  el.innerHTML = '' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">' +
      '<div>' +
        '<div style="font-size:16px;font-weight:600;color:var(--t100)">版本历史</div>' +
        '<div style="font-family:var(--mono);font-size:12px;color:var(--t50);margin-top:4px">' + entries.length + ' 个版本</div>' +
      '</div>' +
      '<button data-nf-action="export-start" onclick="startPipelineExport()" style="border:0;border-radius:999px;padding:10px 16px;background:linear-gradient(135deg,#34d399,#60a5fa);color:#08111f;font-weight:600;cursor:pointer">开始导出</button>' +
    '</div>' +
    renderOutputProgressCard() +
    renderOutputEntries(entries);
}

function updateExportState(patch) {
  pipelineExportState = Object.assign({}, pipelineExportState || {}, patch);
  renderOutputTab(pipelineRenderEntries);
}

function pollExportStatus() {
  if (typeof bridgeCall !== 'function' || !pipelineExportState || !pipelineExportState.pid) return;
  bridgeCall('export.status', { pid: pipelineExportState.pid }).then(function(data) {
    updateExportState({
      state: data.state || 'running',
      percent: typeof data.percent === 'number' ? data.percent : 0,
      eta: typeof data.eta === 'number' ? data.eta : 0,
      error: data.error || '',
      outputPath: data.outputPath || '',
    });

    if (data.state === 'done' || data.state === 'failed') {
      stopExportPolling();
      return;
    }

    scheduleExportPolling(2000);
  }).catch(function(error) {
    stopExportPolling();
    updateExportState({
      state: 'failed',
      error: error && error.message ? error.message : String(error || 'failed to read export status'),
    });
  });
}

function startPipelineExport() {
  if (typeof bridgeCall !== 'function' || !getCurrentEpisodeRef()) return;
  stopExportPolling();
  updateExportState({
    state: 'starting',
    percent: 0,
    eta: 0,
    error: '',
    pid: null,
    logPath: '',
  });

  bridgeCall('export.start', {
    outputPath: getCurrentEpisodeRef() + '/exports/output.mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 45.0,
  }).then(function(data) {
    if (!data.ok) {
      updateExportState({
        state: 'failed',
        error: data.error || 'failed to start export',
        logPath: data.logPath || '',
      });
      return;
    }

    updateExportState({
      state: 'queued',
      pid: data.pid,
      logPath: data.logPath || '',
      error: '',
    });
    pollExportStatus();
  }).catch(function(error) {
    updateExportState({
      state: 'failed',
      error: error && error.message ? error.message : String(error || 'failed to start export'),
    });
  });
}

function cancelPipelineExport() {
  if (typeof bridgeCall !== 'function' || !pipelineExportState || !pipelineExportState.pid) return;
  bridgeCall('export.cancel', { pid: pipelineExportState.pid }).then(function(data) {
    stopExportPolling();
    updateExportState({
      state: data.ok ? 'failed' : 'failed',
      percent: pipelineExportState.percent || 0,
      eta: 0,
      error: data.ok ? 'canceled' : (data.error || 'failed to cancel export'),
    });
  }).catch(function(error) {
    updateExportState({
      state: 'failed',
      error: error && error.message ? error.message : String(error || 'failed to cancel export'),
    });
  });
}

function previewSegmentVideo(segmentName) {
  if (typeof bridgeCall !== 'function' || !segmentName) return;
  pipelinePreviewState[segmentName] = { loading: true };
  renderScriptTab(Array.isArray(window.__nfPipelineSegments) ? window.__nfPipelineSegments : []);

  bridgeCall('segment.videoUrl', normalizeSegmentPreviewParams(segmentName)).catch(function(error) {
    if (!error || String(error).indexOf('invalid params') === -1) {
      throw error;
    }
    return bridgeCall('segment.videoUrl', fallbackSegmentPreviewParams(segmentName));
  }).then(function(data) {
    pipelinePreviewState[segmentName] = {
      loading: false,
      exists: !!data.exists,
      path: data.path || '',
      error: '',
    };
    renderScriptTab(Array.isArray(window.__nfPipelineSegments) ? window.__nfPipelineSegments : []);
  }).catch(function(error) {
    pipelinePreviewState[segmentName] = {
      loading: false,
      exists: false,
      path: '',
      error: error && error.message ? error.message : String(error || 'failed to load segment video'),
    };
    renderScriptTab(Array.isArray(window.__nfPipelineSegments) ? window.__nfPipelineSegments : []);
  });
}

function renderScriptTabWithCache(segments) {
  window.__nfPipelineSegments = segments;
  renderScriptTab(segments);
}

// Editor runtime exports.
window.loadPipelineData = loadPipelineData;
window.renderScriptTab = renderScriptTabWithCache;
window.renderAudioTab = renderAudioTab;
window.renderAtomsTab = renderAtomsTab;
window.renderOutputTab = renderOutputTab;
window.startPipelineExport = startPipelineExport;
window.cancelPipelineExport = cancelPipelineExport;
window.previewSegmentVideo = previewSegmentVideo;
