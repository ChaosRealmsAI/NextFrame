// Pipeline runtime bindings.
let pipelineRenderEntries = [];
let pipelineSegments = [];
let pipelineAudioStage = { voice: null, speed: 1, segments: [] };
let pipelineAudioState = {};
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

function toNfdataUrl(path) {
  if (!path) return '';
  const idx = path.indexOf('/projects/');
  if (idx >= 0) return 'nfdata://localhost/' + encodeURI(path.substring(idx + '/projects/'.length));
  return path;
}

function escapeJsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function resetPipelineEpisodeState() {
  pipelineSegments = [];
  pipelineAudioStage = { voice: null, speed: 1, segments: [] };
  pipelineAudioState = {};
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

  const projectRef = getCurrentProjectRef();
  const episodeRef = getCurrentEpisodeRef();
  const nextScope = episodeRef;
  if (pipelineEpisodeScope !== nextScope) {
    pipelineEpisodeScope = nextScope;
    resetPipelineEpisodeState();
  }

  if (episodeRef) {
    bridgeCall('script.get', { project: projectRef, episode: episodeRef }).then(function(data) {
      const script = data && (data.script || data.value) ? (data.script || data.value) : {};
      const segments = Array.isArray(script.segments) ? script.segments : [];
      pipelineSegments = segments;
      renderScriptTab(segments);
      renderAudioTab(pipelineAudioStage.segments);
    }).catch(function(error) {
      console.error('[pipeline] script.get:', error);
      pipelineSegments = [];
      renderScriptTab([]);
      renderAudioTab(pipelineAudioStage.segments);
    });

    bridgeCall('audio.get', { project: projectRef, episode: episodeRef }).then(function(data) {
      const audio = data && (data.audio || data.value) ? (data.audio || data.value) : {};
      pipelineAudioStage = {
        voice: audio.voice || null,
        speed: typeof audio.speed === 'number' ? audio.speed : 1,
        segments: Array.isArray(audio.segments) ? audio.segments : [],
      };
      renderAudioTab(pipelineAudioStage.segments);
    }).catch(function(error) {
      console.error('[pipeline] audio.get:', error);
      pipelineAudioStage = { voice: null, speed: 1, segments: [] };
      renderAudioTab([]);
    });
  }

  bridgeCall('scene.list', {}).then(function(data) {
    renderAtomsTab(data.scenes || []);
  }).catch(function(error) {
    console.error('[pipeline] scenes:', error);
  });

  // Load existing clips for the clips/asset tab
  if (episodeRef) {
    bridgeCall('source.clips', { episode: episodeRef }).then(function(data) {
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

  // Update sidebar: segment navigation + stats
  const sidebar = document.querySelector('#pl-tab-script .pl-sidebar');
  if (sidebar) {
    const totalChars = segments.reduce(function(s, seg) { return s + (seg.narration || '').length; }, 0);
    const estSecs = Math.round(totalChars / 4); // ~4 chars/sec for Chinese
    let sbHtml = '<div class="pl-sb-section"><div class="pl-sb-title">剧集信息</div>' +
      '<div class="pl-sb-info-row"><span class="pl-sb-label">段落</span><span class="pl-sb-value">' + segments.length + '</span></div>' +
      '<div class="pl-sb-info-row"><span class="pl-sb-label">字数</span><span class="pl-sb-value">' + totalChars + '</span></div>' +
      '<div class="pl-sb-info-row"><span class="pl-sb-label">预估</span><span class="pl-sb-value">~' + estSecs + 's</span></div>' +
    '</div>';
    sbHtml += '<div class="pl-sb-section"><div class="pl-sb-title">段落导航</div>';
    segments.forEach(function(seg, i) {
      const role = seg.role || '';
      const preview = (seg.narration || '').substring(0, 15) + '...';
      sbHtml += '<div class="pl-seg-item" data-nf-action="scroll-to-segment" onclick="scrollToSegment(' + i + ')" style="display:flex;gap:8px;padding:8px;border-radius:8px;cursor:pointer;transition:background 0.2s">' +
        '<div style="width:20px;height:20px;border-radius:50%;background:var(--accent-12);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">' + (i + 1) + '</div>' +
        '<div style="min-width:0"><div style="font-size:12px;font-weight:600;color:var(--t80)">' + escapeHtml(role || '段落 ' + (i + 1)) + '</div>' +
        '<div style="font-size:11px;color:var(--t50);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(preview) + '</div></div>' +
      '</div>';
    });
    sbHtml += '</div>';
    sidebar.innerHTML = sbHtml;
  }

  // Main area: script cards
  const el = document.querySelector('#pl-tab-script .pl-main');
  if (!el) return;
  if (segments.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无脚本段落</div>';
    return;
  }

  let html = '<div style="padding:16px;overflow-y:auto;height:100%">';
  segments.forEach(function(seg, index) {
    const narration = seg.narration || seg.text || '';
    const visual = seg.visual || '';
    const role = seg.role || '';
    const logic = seg.logic || '';
    const charCount = narration.length;
    html += '<div class="glass" id="script-card-' + index + '" data-nf-action="edit-script" style="padding:20px;margin-bottom:12px;border-radius:12px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:13px;font-weight:600;color:var(--accent)">段 ' + (index + 1) + '</span>' +
          (role ? '<span style="font-size:11px;padding:2px 8px;background:var(--accent-12);color:var(--accent);border-radius:4px">' + escapeHtml(role) + '</span>' : '') +
        '</div>' +
        '<span style="font-family:var(--mono);font-size:11px;color:var(--t50)">' + charCount + ' 字</span>' +
      '</div>' +
      '<div contenteditable="true" data-nf-action="edit-narration" data-seg-index="' + index + '" style="font-family:var(--serif,Georgia,serif);font-size:16px;line-height:1.8;color:var(--t80);outline:none;min-height:40px;padding:8px 0;border-bottom:1px solid var(--border)" onblur="saveNarration(this)">' + escapeHtml(narration) + '</div>' +
      (visual || logic ? '<div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">' +
        (visual ? '<div style="flex:1;min-width:120px"><div style="font-size:11px;font-weight:600;color:var(--t50);margin-bottom:4px">画面</div><div style="font-size:12px;color:var(--t65);line-height:1.5">' + escapeHtml(visual) + '</div></div>' : '') +
        (logic ? '<div style="flex:1;min-width:120px"><div style="font-size:11px;font-weight:600;color:var(--t50);margin-bottom:4px">逻辑</div><div style="font-size:12px;color:var(--t65);line-height:1.5">' + escapeHtml(logic) + '</div></div>' : '') +
      '</div>' : '') +
    '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function scrollToSegment(index) {
  const card = document.getElementById('script-card-' + index);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveNarration(el) {
  const index = Number.parseInt(el.dataset.segIndex, 10);
  const text = el.textContent || '';
  if (!pipelineSegments[index]) return;
  pipelineSegments[index].narration = text;
  if (typeof bridgeCall !== 'function' || !getCurrentEpisodeRef()) return;
  bridgeCall('script.set', {
    project: getCurrentProjectRef(),
    episode: getCurrentEpisodeRef(),
    segment: index + 1,
    narration: text,
  }).catch(function(error) {
    console.error('[script] save narration:', error);
  });
}

function getAudioSegmentsForRender(segments) {
  const audioSegments = Array.isArray(segments) ? segments : [];
  if (pipelineSegments.length === 0) return audioSegments;

  const audioBySegment = {};
  audioSegments.forEach(function(seg, index) {
    const segmentNumber = Number(seg.segment) || (index + 1);
    audioBySegment[segmentNumber] = seg;
  });

  const mergedSegments = pipelineSegments.map(function(seg, index) {
    const segmentNumber = index + 1;
    return Object.assign({
      segment: segmentNumber,
      narration: seg.narration || seg.text || '',
    }, audioBySegment[segmentNumber] || {});
  });

  audioSegments.forEach(function(seg, index) {
    const segmentNumber = Number(seg.segment) || (index + 1);
    if (segmentNumber > mergedSegments.length) mergedSegments.push(seg);
  });

  return mergedSegments;
}

function getAudioSegmentNarration(seg, index) {
  if (seg && (seg.narration || seg.text)) return seg.narration || seg.text || '';
  const segmentNumber = Number(seg && seg.segment) || (index + 1);
  const scriptSegment = pipelineSegments[segmentNumber - 1] || {};
  return scriptSegment.narration || scriptSegment.text || '';
}

function renderAudioTab(segments) {
  const el = document.querySelector('#pl-tab-audio .pl-main');
  const audioSegments = getAudioSegmentsForRender(segments);
  if (!el) return;
  if (audioSegments.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无音频数据</div>';
    return;
  }
  audioSegments.forEach(function(seg, index) {
    const segmentNumber = Number(seg.segment) || (index + 1);
    if (!pipelineAudioState[segmentNumber] && typeof bridgeCall === 'function' && getCurrentEpisodeRef()) {
      bridgeCall('audio.status', { episode: getCurrentEpisodeRef(), segment: segmentNumber }).then(function(data) {
        pipelineAudioState[segmentNumber] = {
          exists: !!data.exists,
          mp3: toNfdataUrl(data.mp3 || ''),
          timelineData: data.timelineData || null,
          srt: toNfdataUrl(data.srt || ''),
        };
        renderAudioTabInner(audioSegments);
      }).catch(function() {});
    }
  });
  renderAudioTabInner(audioSegments);
}

function formatTimecode(ms) {
  const s = (ms || 0) / 1000;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return String(m).padStart(2, '0') + ':' + sec;
}

function renderAudioTabInner(segments) {
  const el = document.querySelector('#pl-tab-audio .pl-main');
  if (!el) return;
  let html = '<div style="padding:16px;overflow-y:auto;height:100%">';
  segments.forEach(function(seg, index) {
    const segmentNumber = Number(seg.segment) || (index + 1);
    const narration = getAudioSegmentNarration(seg, index) || '';
    const state = pipelineAudioState[segmentNumber] || {};
    const hasAudio = state.exists && state.mp3;
    const tl = state.timelineData;
    const sentences = (tl && tl.segments) || [];
    const duration = seg.duration || (sentences.length > 0 ? sentences[sentences.length - 1].end_ms / 1000 : 0);
    const statusLabel = hasAudio ? '已生成' : '待生成';
    const statusColor = hasAudio ? 'var(--green)' : 'var(--t50)';

    html += '<div class="glass audio-card" id="audio-card-' + segmentNumber + '" style="padding:20px;margin-bottom:12px;border-radius:12px">';

    // Card body: narration text
    html += '<div style="margin-bottom:12px"><span style="font-size:13px;font-weight:600;color:var(--accent)">段 ' + segmentNumber + '</span></div>';
    html += '<div style="font-size:14px;color:var(--t80);line-height:1.7;margin-bottom:16px">' + escapeHtml(narration) + '</div>';

    // Audio head: play + status + duration
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">';
    if (hasAudio) {
      html += '<button data-nf-action="play-audio" onclick="playKaraokeAudio(' + segmentNumber + ')" style="width:32px;height:32px;border-radius:50%;border:none;background:var(--accent);color:#000;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">&#9654;</button>';
    }
    html += '<span style="font-size:12px;font-weight:600;color:' + statusColor + ';padding:2px 8px;border-radius:4px;background:' + (hasAudio ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)') + '">' + statusLabel + '</span>';
    if (duration > 0) html += '<span style="font-family:var(--mono);font-size:13px;color:var(--t80);margin-left:auto">' + duration.toFixed(1) + 's</span>';
    html += '</div>';

    // Sentence breakdown with karaoke
    if (hasAudio && sentences.length > 0) {
      html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--t50);margin-bottom:8px">逐句分解</div>';
      sentences.forEach(function(sent) {
        const startMs = sent.start_ms || 0;
        const endMs = sent.end_ms || 0;
        const dur = ((endMs - startMs) / 1000).toFixed(1);
        const words = sent.words || [];
        const wordSpans = words.length > 0
          ? words.map(function(w) { return '<span class="ch" data-start="' + (w.start_ms || 0) + '" data-end="' + (w.end_ms || 0) + '">' + escapeHtml(w.word || w.char || '') + '</span>'; }).join('')
          : escapeHtml(sent.text || '');
        html += '<div class="sentence-row" data-seg="' + segmentNumber + '" style="display:grid;grid-template-columns:auto 1fr auto;align-items:start;padding:8px 10px;border-radius:6px;gap:10px;border-left:2px solid transparent">' +
          '<span style="font-family:var(--mono);font-size:12px;color:var(--t50);white-space:nowrap">' + formatTimecode(startMs) + '</span>' +
          '<div><span class="s-text" style="font-size:13px;color:var(--t80);line-height:1.5">' + wordSpans + '</span>' +
            '<div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:4px;overflow:hidden"><div class="s-progress-fill" style="height:100%;width:0;background:var(--accent);transition:width 0.15s linear"></div></div>' +
          '</div>' +
          '<span style="font-family:var(--mono);font-size:12px;color:var(--t50);text-align:right;white-space:nowrap">' + dur + 's</span>' +
        '</div>';
      });
    } else if (!hasAudio) {
      html += '<div style="display:flex;align-items:center;justify-content:center;padding:20px 0;font-size:13px;color:var(--t50)">等待生成</div>';
    }

    html += '</div>';
  });
  el.innerHTML = html;
}

function generateTTS(segmentNumber) {
  if (typeof bridgeCall !== 'function' || !getCurrentEpisodeRef()) return;
  pipelineAudioState[segmentNumber] = Object.assign({}, pipelineAudioState[segmentNumber], { generating: true, error: '' });
  renderAudioTabInner(getAudioSegmentsForRender(pipelineAudioStage.segments));
  bridgeCall('audio.synth', {
    project: getCurrentProjectRef(),
    episode: getCurrentEpisodeRef(),
    segment: segmentNumber,
  }).then(function(data) {
    pipelineAudioState[segmentNumber] = {
      exists: true,
      mp3: data.mp3 || '',
      timelineData: data.timelineData || null,
      generating: false,
      error: '',
    };
    renderAudioTabInner(getAudioSegmentsForRender(pipelineAudioStage.segments));
  }).catch(function(error) {
    pipelineAudioState[segmentNumber] = {
      exists: false,
      generating: false,
      error: String(error),
    };
    renderAudioTabInner(getAudioSegmentsForRender(pipelineAudioStage.segments));
  });
}

let activeKaraokeAudio = null;
let activeKaraokeRaf = null;

function playKaraokeAudio(segmentNumber) {
  // Stop any playing audio
  if (activeKaraokeAudio) {
    activeKaraokeAudio.pause();
    activeKaraokeAudio = null;
  }
  if (activeKaraokeRaf) {
    cancelAnimationFrame(activeKaraokeRaf);
    activeKaraokeRaf = null;
  }

  const state = pipelineAudioState[segmentNumber];
  if (!state || !state.mp3) return;
  const card = document.getElementById('audio-card-' + segmentNumber);
  if (!card) return;

  const audio = new Audio(state.mp3);
  activeKaraokeAudio = audio;
  const chars = card.querySelectorAll('.ch');
  const progressFills = card.querySelectorAll('.s-progress-fill');
  const sentenceRows = card.querySelectorAll('.sentence-row');

  function tick() {
    const ms = audio.currentTime * 1000;
    // Highlight words
    chars.forEach(function(ch) {
      const start = Number(ch.dataset.start) || 0;
      const end = Number(ch.dataset.end) || 0;
      if (ms >= start && ms < end) {
        ch.style.color = 'var(--accent)';
        ch.style.textShadow = '0 0 8px rgba(167,139,250,0.5)';
      } else if (ms >= end) {
        ch.style.color = 'var(--t100)';
        ch.style.textShadow = 'none';
      } else {
        ch.style.color = 'var(--t50)';
        ch.style.textShadow = 'none';
      }
    });
    // Update sentence progress bars
    sentenceRows.forEach(function(row, i) {
      const fill = progressFills[i];
      if (!fill) return;
      const rowChars = row.querySelectorAll('.ch');
      if (rowChars.length === 0) return;
      const rowStart = Number(rowChars[0].dataset.start) || 0;
      const rowEnd = Number(rowChars[rowChars.length - 1].dataset.end) || 1;
      const pct = Math.max(0, Math.min(100, (ms - rowStart) / (rowEnd - rowStart) * 100));
      fill.style.width = (ms >= rowStart ? pct : 0) + '%';
      // Active row highlight
      row.style.borderLeftColor = (ms >= rowStart && ms < rowEnd) ? 'var(--accent)' : 'transparent';
      row.style.background = (ms >= rowStart && ms < rowEnd) ? 'var(--accent-06)' : 'transparent';
    });
    if (!audio.paused && !audio.ended) activeKaraokeRaf = requestAnimationFrame(tick);
  }

  audio.play().then(function() { activeKaraokeRaf = requestAnimationFrame(tick); }).catch(function() {});
  audio.onended = function() { activeKaraokeAudio = null; };
}

function playSegmentAudio(mp3Path) {
  if (activeKaraokeAudio) { activeKaraokeAudio.pause(); activeKaraokeAudio = null; }
  const audio = new Audio(mp3Path);
  activeKaraokeAudio = audio;
  audio.play().catch(function() {});
  audio.onended = function() { activeKaraokeAudio = null; };
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
    const videoUrl = toNfdataUrl(clip.path || '');
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
window.playKaraokeAudio = playKaraokeAudio;
window.scrollToSegment = scrollToSegment;
window.saveNarration = saveNarration;
window.generateTTS = generateTTS;
window.playSegmentAudio = playSegmentAudio;
window.renderClipsTab = renderClipsTab;
window.playClipVideo = playClipVideo;
