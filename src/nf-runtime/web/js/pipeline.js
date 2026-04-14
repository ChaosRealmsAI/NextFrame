// Pipeline runtime bindings.
let pipelineRenderEntries = [];
let pipelineSegments = [];
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
  pipelineSegments = [];
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

  // Load existing clips for the clips/asset tab
  if (getCurrentEpisodeRef()) {
    bridgeCall('source.clips', { episode: getCurrentEpisodeRef() }).then(function(data) {
      renderClipsTab(data.clips || []);
    }).catch(function() {
      renderClipsTab([]);
    });
  }

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
  pipelineSegments = segments;
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
      '<div class="glass" data-nf-action="generate-script" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
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

let pipelineAudioState = {};

function renderAudioTab(segments) {
  const el = document.querySelector('#pl-tab-audio .pl-main');
  if (!el) return;
  if (segments.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无音频数据</div>';
    return;
  }
  // Check TTS status for each segment
  segments.forEach(function(seg) {
    const segName = seg.name || seg.path || '';
    if (!pipelineAudioState[segName] && typeof bridgeCall === 'function' && getCurrentEpisodeRef()) {
      bridgeCall('tts.status', { episode: getCurrentEpisodeRef(), segment: segName }).then(function(data) {
        pipelineAudioState[segName] = { exists: data.exists, mp3: data.mp3 || '' };
        renderAudioTabInner(segments);
      }).catch(function() {});
    }
  });
  renderAudioTabInner(segments);
}

function renderAudioTabInner(segments) {
  const el = document.querySelector('#pl-tab-audio .pl-main');
  if (!el) return;
  let html = '';
  segments.forEach(function(seg, index) {
    const segName = seg.name || seg.path || '';
    const state = pipelineAudioState[segName] || {};
    const hasAudio = state.exists && state.mp3;
    html += '<div class="glass" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
        '<div><div style="font-size:13px;font-weight:600;color:var(--t100)">音频 ' + (index + 1) + '</div>' +
        '<div style="font-size:12px;color:var(--t65);margin-top:4px">' + escapeHtml(segName) + '</div></div>' +
        '<div style="display:flex;gap:6px">' +
          (hasAudio
            ? '<button data-nf-action="play-audio" onclick="playSegmentAudio(\'' + escapeJsString(state.mp3) + '\')" style="border:0;border-radius:999px;padding:6px 12px;background:rgba(52,211,153,0.15);color:var(--green);cursor:pointer;font-size:12px">播放</button>'
            : '') +
          '<button data-nf-action="generate-tts" onclick="generateTTS(\'' + escapeJsString(segName) + '\')" style="border:0;border-radius:999px;padding:6px 12px;background:rgba(167,139,250,0.15);color:var(--accent);cursor:pointer;font-size:12px">' + (hasAudio ? '重新生成' : '生成配音') + '</button>' +
        '</div>' +
      '</div>' +
      (state.generating ? '<div style="font-size:11px;color:var(--t50);margin-top:8px">正在生成配音...</div>' : '') +
      (hasAudio ? '<audio controls preload="metadata" style="width:100%;margin-top:8px;height:32px" src="' + escapeHtml(state.mp3) + '"></audio>' : '') +
    '</div>';
  });
  el.innerHTML = html;
}

function generateTTS(segName) {
  if (typeof bridgeCall !== 'function' || !getCurrentEpisodeRef()) return;
  pipelineAudioState[segName] = { generating: true };
  renderAudioTabInner(pipelineSegments);
  bridgeCall('tts.synth', {
    episode: getCurrentEpisodeRef(),
    segment: segName,
    text: segName,
  }).then(function(data) {
    pipelineAudioState[segName] = { exists: true, mp3: data.mp3 || '' };
    renderAudioTabInner(pipelineSegments);
  }).catch(function(error) {
    pipelineAudioState[segName] = { exists: false, error: String(error) };
    renderAudioTabInner(pipelineSegments);
  });
}

function playSegmentAudio(mp3Path) {
  const audio = new Audio(mp3Path);
  audio.play().catch(function() {});
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
  renderScriptTab(pipelineSegments);

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
    renderScriptTab(pipelineSegments);
  }).catch(function(error) {
    pipelinePreviewState[segmentName] = {
      loading: false,
      exists: false,
      path: '',
      error: error && error.message ? error.message : String(error || 'failed to load segment video'),
    };
    renderScriptTab(pipelineSegments);
  });
}

function renderClipsTab(clips) {
  const el = document.querySelector('#pl-tab-asset .pl-main');
  if (!el) return;
  if (clips.length === 0) {
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--t50)">' +
      '<div style="font-size:15px;font-weight:500">暂无切片</div>' +
      '<div style="font-size:13px">从源视频切分段落素材</div>' +
    '</div>';
    return;
  }
  let html = '<div style="padding:16px"><div style="font-size:14px;font-weight:600;color:var(--t100);margin-bottom:12px">' + clips.length + ' 个切片</div>';
  clips.forEach(function(clip) {
    const name = clip.name || '';
    const sizeMB = clip.size ? (clip.size / 1024 / 1024).toFixed(1) + ' MB' : '';
    const relPath = (clip.path || '').replace(/^.*\/projects\//, '');
    const videoUrl = relPath ? 'nfdata://localhost/' + relPath : '';
    html += '<div class="glass" data-nf-action="preview-clip" style="padding:12px;margin-bottom:8px;border-radius:10px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
        '<div><div style="font-size:13px;font-weight:600;color:var(--t100)">' + escapeHtml(name) + '</div>' +
        '<div style="font-family:var(--mono);font-size:11px;color:var(--t50);margin-top:2px">' + escapeHtml(sizeMB) + '</div></div>' +
        (videoUrl ? '<button data-nf-action="play-clip" onclick="playClipVideo(\'' + escapeJsString(videoUrl) + '\')" style="border:0;border-radius:999px;padding:6px 12px;background:rgba(167,139,250,0.15);color:var(--accent);cursor:pointer;font-size:12px">播放</button>' : '') +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function playClipVideo(url) {
  let overlay = document.getElementById('clip-video-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'clip-video-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = '<div style="position:relative;max-width:80vw;max-height:70vh;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8)">' +
    '<video src="' + escapeHtml(url) + '" controls autoplay style="max-width:80vw;max-height:70vh"></video>' +
    '<button data-nf-action="close-clip-preview" onclick="document.getElementById(\'clip-video-overlay\').remove()" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px">×</button>' +
  '</div>';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// Editor runtime exports.
window.loadPipelineData = loadPipelineData;
window.renderScriptTab = renderScriptTab;
window.renderAudioTab = renderAudioTab;
window.renderAtomsTab = renderAtomsTab;
window.renderOutputTab = renderOutputTab;
window.startPipelineExport = startPipelineExport;
window.cancelPipelineExport = cancelPipelineExport;
window.previewSegmentVideo = previewSegmentVideo;
window.generateTTS = generateTTS;
window.playSegmentAudio = playSegmentAudio;
window.renderClipsTab = renderClipsTab;
window.playClipVideo = playClipVideo;
