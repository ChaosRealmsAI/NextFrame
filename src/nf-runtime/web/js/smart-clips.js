// 智能切片 Tab — Source videos + clips display
let scSources = [];
let scActiveSource = 0;
let scClips = [];
let scSentences = {};

function loadSmartClips() {
  if (typeof bridgeCall !== 'function' || !window.currentEpisodePath) return;
  // Load sources from episode/sources/ directory
  bridgeCall('fs.listDir', { path: window.currentEpisodePath + '/sources' }).then(function(data) {
    const entries = (data.entries || []).filter(function(e) { return e.name && e.name.endsWith('.mp4'); });
    scSources = entries.map(function(e) {
      return { name: e.name, path: window.currentEpisodePath + '/sources/' + e.name };
    });
    // Also check for source.json metadata
    return bridgeCall('fs.listDir', { path: window.currentEpisodePath + '/sources' });
  }).then(function() {
    renderSourceList();
    if (scSources.length > 0) selectSmartSource(0);
    // Load clips
    return bridgeCall('source.clips', { episode: window.currentEpisodePath });
  }).then(function(data) {
    scClips = data.clips || [];
    renderClipCards();
  }).catch(function(e) {
    console.error('[smart-clips] load:', e);
    renderSourceList();
    renderClipCards();
  });
}

function renderSourceList() {
  const sidebar = document.querySelector('#pl-tab-asset .pl-sidebar');
  if (!sidebar) return;
  let html = '<div style="padding:16px 16px 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--t50)">源视频</div>';
  if (scSources.length === 0) {
    html += '<div style="padding:16px;font-size:13px;color:var(--t50)">暂无源视频</div>';
  }
  scSources.forEach(function(src, i) {
    html += '<div class="sc-src-item' + (i === scActiveSource ? ' active' : '') + '" data-nf-action="select-source" onclick="selectSmartSource(' + i + ')">' +
      '<div class="sc-src-name">' + escapeHtml(src.name) + '</div>' +
      '<div class="sc-src-meta"><span>' + escapeHtml(src.duration || '—') + '</span><span>' + escapeHtml(src.resolution || '—') + '</span></div>' +
      '<div class="sc-src-clips-count">' + scClips.length + ' clips</div>' +
    '</div>';
  });
  sidebar.innerHTML = html;
}

function selectSmartSource(i) {
  scActiveSource = i;
  document.querySelectorAll('.sc-src-item').forEach(function(el, idx) {
    el.classList.toggle('active', idx === i);
  });
  renderSourceDetail();
  // Load sentences for this source
  const src = scSources[i];
  if (src) {
    const sentPath = src.path.replace('.mp4', '') + '-sentences.json';
    // Try loading sentences
    bridgeCall('fs.read', { path: window.currentEpisodePath + '/sources/dario-sentences.json' }).then(function(data) {
      const raw = data.contents || data.content || '';
      let parsed;
      try { parsed = typeof raw === 'object' ? raw : JSON.parse(raw); } catch(e) { parsed = {}; }
      scSentences = parsed;
      renderClipCards();
    }).catch(function() {});
  }
}

function renderSourceDetail() {
  const main = document.querySelector('#pl-tab-asset .pl-main');
  if (!main) return;
  const src = scSources[scActiveSource];
  if (!src) {
    main.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">选择一个源视频</div>';
    return;
  }

  const srcPath = toNfdataUrl(src.path);
  let html = '';

  // Header
  html += '<div class="glass sc-detail-header"><div class="sc-detail-top">' +
    '<div class="sc-detail-name">' + escapeHtml(src.name) + '</div>' +
    '<button class="sc-preview-btn" data-nf-action="preview-source" onclick="openSmartPlayer(-1)">&#9654; 预览原视频</button>' +
  '</div>' +
  '<div class="sc-detail-path">' + escapeHtml(decodeURI(srcPath).replace('nfdata://localhost/', '~/NextFrame/projects/')) + '</div>' +
  '<div class="sc-detail-tags">' +
    '<span class="sc-tag sc-tag-warm">' + escapeHtml(src.duration || '—') + '</span>' +
    '<span class="sc-tag sc-tag-default">' + escapeHtml(src.resolution || '—') + '</span>' +
    (scSentences.total_sentences ? '<span class="sc-tag sc-tag-accent">' + scSentences.total_sentences + ' sentences</span>' : '') +
    '<span class="sc-tag sc-tag-accent">' + scClips.length + ' clips</span>' +
  '</div></div>';

  // Timeline overview
  if (scClips.length > 0) {
    html += '<div class="glass sc-timeline"><div class="sc-tl-label">时间轴 · 切片分布</div><div class="sc-tl-bar">';
    const colors = ['var(--accent)', '#60a5fa', 'var(--green)', '#f472b6', 'var(--warm)'];
    scClips.forEach(function(clip, i) {
      // Estimate position (we don't have exact timecodes from source.clips, use even spacing)
      const left = (i / scClips.length * 80 + 5);
      const width = Math.max(3, 70 / scClips.length);
      html += '<div class="sc-tl-region" style="left:' + left + '%;width:' + width + '%;background:' + colors[i % colors.length] + '" title="' + escapeHtml(clip.name) + '"><span class="sc-tl-region-label">' + (i + 1) + '</span></div>';
    });
    html += '</div><div class="sc-tl-ticks"><span class="sc-tl-tick">0:00</span><span class="sc-tl-tick">end</span></div></div>';
  }

  // Clip cards container
  html += '<div class="sc-clip-scroll" id="sc-clip-list"></div>';

  main.innerHTML = html;
  renderClipCards();
}

function renderClipCards() {
  const container = document.getElementById('sc-clip-list');
  if (!container) return;
  if (scClips.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--t50)">暂无切片</div>';
    return;
  }

  const allSentences = (scSentences && scSentences.sentences) || [];
  let html = '';

  scClips.forEach(function(clip, i) {
    const videoUrl = toNfdataUrl(clip.path || '');
    const sizeMB = clip.size ? (clip.size / 1024 / 1024).toFixed(1) + 'MB' : '';

    html += '<div class="sc-clip-card" id="sc-clip-' + i + '">';

    // Top: num + name + duration + timecode
    html += '<div class="sc-clip-top">' +
      '<div class="sc-clip-num">' + (i + 1) + '</div>' +
      '<div class="sc-clip-name">' + escapeHtml(clip.name) + '</div>' +
      (sizeMB ? '<div class="sc-clip-dur">' + escapeHtml(sizeMB) + '</div>' : '') +
    '</div>';

    // Body: video preview + sentences
    html += '<div class="sc-clip-body">';

    // Video thumbnail
    html += '<div class="sc-clip-video" data-nf-action="preview-clip" onclick="openSmartPlayer(' + i + ')">' +
      (videoUrl ? '<video src="' + escapeHtml(videoUrl) + '" preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>' : '') +
      '<div class="sc-play-overlay"><div class="sc-play-circle">&#9654;</div></div>' +
    '</div>';

    // Sentences (show first few from source if available)
    html += '<div class="sc-sentences">';
    // For now show a few sample sentences
    const sampleSents = allSentences.slice(i * 3, i * 3 + 3);
    if (sampleSents.length > 0) {
      sampleSents.forEach(function(sent) {
        const startTc = formatSmartTc(sent.start);
        const dur = ((sent.end - sent.start)).toFixed(1);
        html += '<div class="sc-sent-row">' +
          '<span class="sc-sent-tc">' + startTc + '</span>' +
          '<div class="sc-sent-content">' +
            '<div class="sc-sent-lang-row"><span class="sc-sent-lang-label">EN</span><span class="sc-sent-text">' + escapeHtml(sent.text) + '</span></div>' +
            (sent.zh ? '<div class="sc-sent-lang-row"><span class="sc-sent-lang-label">中</span><span class="sc-sent-trans">' + escapeHtml(sent.zh) + '</span></div>' : '') +
            (sent.ja ? '<div class="sc-sent-lang-row"><span class="sc-sent-lang-label">日</span><span class="sc-sent-trans">' + escapeHtml(sent.ja) + '</span></div>' : '') +
          '</div>' +
          '<span class="sc-sent-dur">' + dur + 's</span>' +
        '</div>';
      });
    } else {
      html += '<div style="padding:8px;font-size:12px;color:var(--t50)">无字幕数据</div>';
    }
    html += '</div></div>';

    // Meta bar
    html += '<div class="sc-meta-bar">' +
      '<span class="sc-meta-tag">clip ' + (i + 1) + '</span>' +
      '<button class="sc-more-btn" data-nf-action="clip-meta" onclick="openSmartMeta(' + i + ')">更多 ↗</button>' +
    '</div>';

    html += '</div>';
  });

  container.innerHTML = html;
}

// Player modal
function openSmartPlayer(clipIdx) {
  let modal = document.getElementById('sc-player-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sc-player-modal';
    modal.className = 'sc-modal-overlay';
    modal.onclick = function(e) { if (e.target === modal) closeSmartPlayer(); };
    document.body.appendChild(modal);
  }

  let videoUrl, title;
  if (clipIdx < 0) {
    // Source video
    const src = scSources[scActiveSource];
    if (!src) return;
    videoUrl = toNfdataUrl(src.path);
    title = src.name;
  } else {
    const clip = scClips[clipIdx];
    if (!clip) return;
    videoUrl = toNfdataUrl(clip.path);
    title = clip.name;
  }

  modal.innerHTML = '<div class="sc-modal-player glass">' +
    '<div style="width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#0a0a0f">' +
      '<video id="sc-modal-video" src="' + escapeHtml(videoUrl) + '" controls autoplay style="width:100%;height:100%;object-fit:contain"></video>' +
    '</div>' +
    '<div class="sc-modal-subtitle" id="sc-modal-subs"><div class="sc-modal-sub-lang-row"><span class="sc-modal-sub-original" style="color:var(--t50);text-align:center">播放中...</span></div></div>' +
    '<div class="sc-modal-transport"><div style="display:flex;align-items:center;justify-content:center;padding:8px 0"><span class="sc-modal-clip-name">' + escapeHtml(title) + '</span></div></div>' +
    '<button class="sc-modal-close" onclick="closeSmartPlayer()">&times;</button>' +
  '</div>';
  modal.classList.add('open');
}

function closeSmartPlayer() {
  const modal = document.getElementById('sc-player-modal');
  if (!modal) return;
  const video = document.getElementById('sc-modal-video');
  if (video) video.pause();
  modal.classList.remove('open');
}

// Meta modal
function openSmartMeta(clipIdx) {
  const clip = scClips[clipIdx];
  if (!clip) return;

  let modal = document.getElementById('sc-meta-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sc-meta-modal';
    modal.className = 'sc-meta-overlay';
    modal.onclick = function(e) { if (e.target === modal) closeSmartMeta(); };
    document.body.appendChild(modal);
  }

  let html = '<div class="sc-meta-modal glass">' +
    '<div class="sc-meta-title">' + escapeHtml(clip.name) + ' · 元信息</div>' +
    '<button class="sc-modal-close" onclick="closeSmartMeta()">&times;</button>';

  // Show all available metadata
  const keys = Object.keys(clip);
  keys.forEach(function(k) {
    const v = clip[k];
    const display = Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    html += '<div class="sc-meta-row"><span class="sc-meta-key">' + escapeHtml(k) + '</span><span class="sc-meta-val">' + escapeHtml(display) + '</span></div>';
  });

  html += '</div>';
  modal.innerHTML = html;
  modal.classList.add('open');
}

function closeSmartMeta() {
  const modal = document.getElementById('sc-meta-modal');
  if (modal) modal.classList.remove('open');
}

function formatSmartTc(s) {
  if (typeof s !== 'number') return '00:00.0';
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return String(m).padStart(2, '0') + ':' + sec;
}

// Use shared escapeHtml from pipeline.js
if (typeof escapeHtml !== 'function') {
  window.escapeHtml = function(v) { return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
}

window.loadSmartClips = loadSmartClips;
window.selectSmartSource = selectSmartSource;
window.openSmartPlayer = openSmartPlayer;
window.closeSmartPlayer = closeSmartPlayer;
window.openSmartMeta = openSmartMeta;
window.closeSmartMeta = closeSmartMeta;
