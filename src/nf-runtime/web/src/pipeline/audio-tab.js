// Pipeline audio tab — TTS generation, karaoke playback, sentence breakdown.
// Depends on: pipeline-utils.js (escapeHtml, toNfdataUrl, formatTimecode, getCurrentProjectRef, getCurrentEpisodeRef)
// Shared state: pipelineSegments, pipelineAudioStage, pipelineAudioState (defined in pipeline.js)

let activeKaraokeAudio = null;
let activeKaraokeRaf = null;
let activeKaraokeSegment = null;

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

function renderAudioTabInner(segments) {
  const el = document.querySelector('#pl-tab-audio .pl-main');
  if (!el) return;

  // Update sidebar: stats + segment nav with status dots
  const sidebar = document.querySelector('#pl-tab-audio .pl-sidebar');
  if (sidebar) {
    let generatedCount = 0;
    segments.forEach(function(seg, index) {
      const sn = Number(seg.segment) || (index + 1);
      if (pipelineAudioState[sn] && pipelineAudioState[sn].exists) generatedCount++;
    });
    const stageVoice = (pipelineAudioStage && pipelineAudioStage.voice) || '';
    const stageSpeed = pipelineAudioStage && typeof pipelineAudioStage.speed === 'number' ? pipelineAudioStage.speed : null;
    const stageEngine = (pipelineAudioStage && pipelineAudioStage.engine) || '';
    let sbHtml = '<div class="pl-sb-section"><div class="pl-sb-title">音频设置</div>' +
      '<div class="pl-sb-info-row"><span class="pl-sb-label">引擎</span><span class="pl-sb-value">' + escapeHtml(stageEngine || '—') + '</span></div>' +
      '<div class="pl-sb-info-row"><span class="pl-sb-label">语音</span><span class="pl-sb-value">' + escapeHtml(stageVoice || '—') + '</span></div>' +
      '<div class="pl-sb-info-row"><span class="pl-sb-label">语速</span><span class="pl-sb-value">' + (stageSpeed !== null ? stageSpeed.toFixed(1) + 'x' : '—') + '</span></div>' +
      '<div class="pl-sb-stats" style="display:flex;gap:16px;margin-top:12px">' +
        '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:var(--green)">' + generatedCount + '</div><div style="font-size:11px;color:var(--t50)">已生成</div></div>' +
        '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:var(--t80)">' + segments.length + '</div><div style="font-size:11px;color:var(--t50)">总段数</div></div>' +
      '</div></div>';
    sbHtml += '<div class="pl-sb-section"><div class="pl-sb-title">段落导航</div>';
    segments.forEach(function(seg, index) {
      const sn = Number(seg.segment) || (index + 1);
      const narr = getAudioSegmentNarration(seg, index) || '';
      const preview = narr.substring(0, 12) + (narr.length > 12 ? '...' : '');
      const hasAudio = pipelineAudioState[sn] && pipelineAudioState[sn].exists;
      const dotColor = hasAudio ? 'var(--green)' : 'var(--t50)';
      sbHtml += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer" onclick="document.getElementById(\'audio-card-' + sn + '\')?.scrollIntoView({behavior:\'smooth\',block:\'start\'})">' +
        '<div style="width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--t80)">' + sn + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:12px;color:var(--t80);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(preview) + '</div></div>' +
        '<div style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';flex-shrink:0"></div>' +
      '</div>';
    });
    sbHtml += '</div>';
    sidebar.innerHTML = sbHtml;
  }

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

    // Audio head: play/pause + status + duration
    const isPlaying = activeKaraokeAudio && !activeKaraokeAudio.paused && activeKaraokeSegment === segmentNumber;
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">';
    if (hasAudio) {
      html += '<button data-nf-action="play-audio" id="play-btn-' + segmentNumber + '" onclick="toggleKaraokeAudio(' + segmentNumber + ')" style="width:32px;height:32px;border-radius:50%;border:none;background:var(--accent);color:#000;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">' + (isPlaying ? '&#9646;&#9646;' : '&#9654;') + '</button>';
    }
    html += '<span style="font-size:12px;font-weight:600;color:' + statusColor + ';padding:2px 8px;border-radius:4px;background:' + (hasAudio ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)') + '">' + statusLabel + '</span>';
    if (duration > 0) html += '<span style="font-family:var(--mono);font-size:13px;color:var(--t80);margin-left:auto">' + duration.toFixed(1) + 's</span>';
    html += '</div>';
    // File path
    if (hasAudio && state.mp3) {
      const rawPath = decodeURI(state.mp3).replace('nfdata://localhost/', '~/NextFrame/projects/');
      html += '<div style="font-family:var(--mono);font-size:11px;color:var(--t50);margin-bottom:12px;word-break:break-all">' + escapeHtml(rawPath) + '</div>';
    }

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

function toggleKaraokeAudio(segmentNumber) {
  if (activeKaraokeAudio && activeKaraokeSegment === segmentNumber && !activeKaraokeAudio.paused) {
    activeKaraokeAudio.pause();
    const btn = document.getElementById('play-btn-' + segmentNumber);
    if (btn) btn.innerHTML = '&#9654;';
    return;
  }
  playKaraokeAudio(segmentNumber);
}

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
  activeKaraokeSegment = segmentNumber;
  const btn = document.getElementById('play-btn-' + segmentNumber);
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

  audio.play().then(function() {
    if (btn) btn.innerHTML = '&#9646;&#9646;';
    activeKaraokeRaf = requestAnimationFrame(tick);
  }).catch(function() {});
  audio.onended = function() {
    activeKaraokeAudio = null;
    activeKaraokeSegment = null;
    if (btn) btn.innerHTML = '&#9654;';
  };
}

function playSegmentAudio(mp3Path) {
  if (activeKaraokeAudio) { activeKaraokeAudio.pause(); activeKaraokeAudio = null; }
  const audio = new Audio(mp3Path);
  activeKaraokeAudio = audio;
  audio.play().catch(function() {});
  audio.onended = function() { activeKaraokeAudio = null; };
}
