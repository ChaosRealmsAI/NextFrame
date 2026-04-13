/* === pipeline.js (v0.4) === */
let pipelineData = null;
let pipelineStage = "script";

async function goPipeline(project, episode) {
  if (typeof project === "string") currentProject = project;
  if (typeof episode === "string") currentEpisode = episode;

  stopWatching();
  setPlaybackState(false);
  switchView("view-pipeline");

  var plProject = document.getElementById("pl-bc-project");
  var plEpisode = document.getElementById("pl-bc-episode");
  if (plProject) plProject.textContent = currentProject || "Project";
  if (plEpisode) plEpisode.textContent = currentEpisode || "Episode";

  pipelineData = null;
  renderPipelineStage();

  try {
    var homePath = "~/NextFrame/projects/" + currentProject + "/" + currentEpisode + "/pipeline.json";
    var result = await bridgeCall("fs.read", { path: homePath }, 3000);
    pipelineData = JSON.parse(result.contents);
  } catch (_e) {
    pipelineData = { version: "0.4", script: { principles: {}, arc: [], segments: [] }, audio: { voice: null, speed: 1, segments: [] }, atoms: [], outputs: [] };
  }
  renderPipelineStage();
}

function switchPipelineStage(stage) {
  pipelineStage = stage;
  if (stage === "assembly") {
    // Switch to editor view — it has matching tabs with 剪辑 active
    if (currentProject && currentEpisode) {
      goEditor(currentProject, currentEpisode);
    }
    return;
  }
  // For non-assembly stages, ensure we're in pipeline view
  var activeView = document.querySelector(".view.active");
  if (activeView && activeView.id === "view-editor") {
    switchView("view-pipeline");
  }
  // Update tab highlights across BOTH pipeline and editor tabs
  document.querySelectorAll(".pl-tab").forEach(function(tab) {
    tab.classList.toggle("active", tab.dataset.stage === stage);
  });
  renderPipelineStage();
}

function renderPipelineStage() {
  var container = document.getElementById("pipeline-content");
  if (!container) return;
  resetPipelineAudioPlayback();

  if (!pipelineData) {
    container.innerHTML = '<div class="pipeline-empty">Loading...</div>';
    return;
  }

  switch (pipelineStage) {
    case "script": container.innerHTML = renderPipelineScript(pipelineData); break;
    case "audio": container.innerHTML = renderPipelineAudio(pipelineData); break;
    case "clips": container.innerHTML = renderPipelineClips(pipelineData); break;
    case "atoms": container.innerHTML = renderPipelineAtoms(pipelineData); break;
    case "assembly":
      container.innerHTML = '<div class="pipeline-empty">正在加载编辑器...</div>';
      if (currentProject && currentEpisode) goEditor(currentProject, currentEpisode);
      break;
    case "output": container.innerHTML = renderPipelineOutput(pipelineData); break;
    default: container.innerHTML = '<div class="pipeline-empty">Unknown stage</div>';
  }
  // Bind events after innerHTML render (WKWebView strips inline onclick)
  bindPipelineEvents(container);
}

function bindPipelineEvents(container) {
  // Audio play buttons
  container.querySelectorAll("[data-audio-path]").forEach(function(btn) {
    btn.addEventListener("click", function() { playPipelineAudio(btn, btn.dataset.audioPath); });
  });
  // Video play buttons
  container.querySelectorAll("[data-video-path]").forEach(function(btn) {
    btn.addEventListener("click", function(e) { e.stopPropagation(); playPipelineVideo(btn.dataset.videoPath); });
  });
  // Segment filter pills
  container.querySelectorAll("[data-filter-seg]").forEach(function(pill) {
    pill.addEventListener("click", function() { plFilterSeg(parseInt(pill.dataset.filterSeg)); });
  });
  // Atom type filter
  container.querySelectorAll("[data-filter-type]").forEach(function(pill) {
    pill.addEventListener("click", function() {
      var type = pill.dataset.filterType;
      container.querySelectorAll("[data-filter-type]").forEach(function(p) {
        p.classList.toggle("active", p.dataset.filterType === type);
      });
      container.querySelectorAll("[data-type]").forEach(function(card) {
        card.style.display = (type === "all" || card.dataset.type === type) ? "" : "none";
      });
    });
  });
}


/**
 * Render pipeline script view: toolbar (principles + segment filter) + two-column table.
 * @param {Object} data
 * @param {Object} data.script.principles  - { audience, tone, style, pace, ... }
 * @param {Array}  data.script.segments    - [{ segment, narration, visual, role, logic }, ...]
 * @returns {string} HTML string
 */
function renderPipelineScript(data) {
  var script = data && data.script;
  if (!script || !script.segments || script.segments.length === 0) {
    return '<div class="pipeline-empty" style="padding:40px;text-align:center;color:rgba(228,228,232,0.5);font-size:13px;">No script data</div>';
  }

  var principles = script.principles || {};
  var segments = script.segments;
  var html = '';

  // ── Toolbar: principle chips ──
  html += '<div class="pl-toolbar" style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-wrap:wrap;gap:20px;align-items:center;">';
  var pKeys = Object.keys(principles);
  for (var p = 0; p < pKeys.length; p++) {
    var k = pKeys[p];
    html += '<div class="pl-chip" style="display:flex;align-items:center;gap:6px;">';
    html += '<span class="pl-chip-label" style="font-size:11px;color:rgba(228,228,232,0.5);">' + escHtml(k) + '</span>';
    html += '<span class="pl-chip-val" style="font-size:12px;color:rgba(228,228,232,0.5);font-weight:500;">' + escHtml(principles[k]) + '</span>';
    html += '</div>';
  }
  html += '</div>';

  // ── Toolbar: divider ──
  html += '<div class="pl-divider" style="height:0;border-bottom:1px solid rgba(255,255,255,0.06);"></div>';

  // ── Toolbar: segment filter pills ──
  html += '<div class="pl-toolbar" style="padding:8px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:6px;align-items:center;">';
  html += '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-right:8px;">Segments</span>';
  html += '<span class="pl-seg-pill" data-seg="-1" data-filter-seg="-1" style="font-size:12px;padding:4px 14px;border-radius:5px;border:1px solid rgba(124,106,239,0.2);background:rgba(124,106,239,0.15);color:#7c6aef;cursor:pointer;">All</span>';
  for (var s = 0; s < segments.length; s++) {
    html += '<span class="pl-seg-pill" data-seg="' + s + '" data-filter-seg="' + s + '" style="font-size:12px;padding:4px 14px;border-radius:5px;border:1px solid transparent;background:transparent;color:rgba(228,228,232,0.5);cursor:pointer;">' + escHtml(String(segments[s].segment)) + '</span>';
  }
  html += '</div>';

  // ── Two-column table ──
  html += '<div class="pl-table" style="width:100%;overflow-y:auto;">';
  html += '<table style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr>';
  html += '<th style="width:55%;padding:10px 24px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(228,228,232,0.5);text-align:left;font-weight:400;border-bottom:1px solid rgba(255,255,255,0.06);background:#111114;position:sticky;top:0;z-index:2;">Narration</th>';
  html += '<th style="width:45%;padding:10px 24px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(228,228,232,0.5);text-align:left;font-weight:400;border-bottom:1px solid rgba(255,255,255,0.06);background:#111114;position:sticky;top:0;z-index:2;">Details</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    html += '<tr data-seg="' + i + '">';

    // Left column: narration (Georgia 17px)
    html += '<td style="font-family:Georgia,\'Times New Roman\',serif;font-size:17px;line-height:1.9;color:#e4e4e8;width:55%;padding:28px 24px;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;">';
    html += escHtml(seg.narration || '');
    html += '</td>';

    // Right column: visual + role/intent + logic
    html += '<td style="background:#111114;width:45%;padding:28px 24px;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;">';

    if (seg.visual) {
      html += '<div class="pl-meta-item" style="margin-bottom:10px;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Visual</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;">' + escHtml(seg.visual) + '</div>';
      html += '</div>';
    }

    if (seg.role) {
      html += '<div class="pl-meta-item" style="margin-bottom:10px;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Intent</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;">' + escHtml(seg.role) + '</div>';
      html += '</div>';
    }

    if (seg.logic) {
      html += '<div class="pl-meta-item" style="margin-bottom:0;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Logic</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;font-style:italic;">' + escHtml(seg.logic) + '</div>';
      html += '</div>';
    }

    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';

  return html;
}

/**
 * Segment filter: show/hide table rows + toggle active pill styling.
 * @param {number} idx  -1 = show all, 0..N = show only that segment index
 */
function plFilterSeg(idx) {
  var pills = document.querySelectorAll('.pl-seg-pill');
  for (var i = 0; i < pills.length; i++) {
    var isActive = (idx === -1) ? (i === 0) : (parseInt(pills[i].getAttribute('data-seg'), 10) === idx);
    if (isActive) {
      pills[i].style.background = 'rgba(124,106,239,0.15)';
      pills[i].style.color = '#7c6aef';
      pills[i].style.borderColor = 'rgba(124,106,239,0.2)';
    } else {
      pills[i].style.background = 'transparent';
      pills[i].style.color = 'rgba(228,228,232,0.5)';
      pills[i].style.borderColor = 'transparent';
    }
  }
  var rows = document.querySelectorAll('.pl-table tbody tr[data-seg]');
  for (var r = 0; r < rows.length; r++) {
    rows[r].style.display = (idx === -1 || parseInt(rows[r].getAttribute('data-seg'), 10) === idx) ? '' : 'none';
  }
}

// Pipeline audio/video playback
var _plAudio = null;
var _plAudioBtn = null;
var _plAudioChars = [];
var _plAudioRaf = 0;
var PIPELINE_PROJECTS_ROOT = "~/NextFrame/projects/";

function buildPipelineMediaUrl(filePath) {
  var relativePath = String(filePath || "");
  if (!relativePath) return "";
  if (relativePath.indexOf(PIPELINE_PROJECTS_ROOT) === 0) {
    relativePath = relativePath.slice(PIPELINE_PROJECTS_ROOT.length);
  }
  var parts = relativePath.split("/").filter(function(part) { return part.length > 0; });
  if (parts.length === 0) return "";
  if (typeof buildNfdataUrl === "function") {
    return buildNfdataUrl(parts);
  }
  return "nfdata://localhost/" + parts.map(function(part) {
    return encodeURIComponent(String(part));
  }).join("/");
}

function setPipelineAudioButtonState(btn, isPlaying) {
  if (!btn) return;
  btn.classList.toggle("playing", Boolean(isPlaying));
  btn.innerHTML = isPlaying ? "&#10074;&#10074;" : "&#9654;";
}

function setPipelineKaraokeCharState(span, state) {
  if (!span) return;
  var className = "karaoke-char " + state;
  if (span.className !== className) span.className = className;
}

function resetPipelineKaraokeChars() {
  for (var i = 0; i < _plAudioChars.length; i++) {
    setPipelineKaraokeCharState(_plAudioChars[i], "unspoken");
  }
  _plAudioChars = [];
}

function stopPipelineKaraokeLoop() {
  if (_plAudioRaf) {
    cancelAnimationFrame(_plAudioRaf);
    _plAudioRaf = 0;
  }
}

function updatePipelineKaraokeChars(currentTime) {
  for (var i = 0; i < _plAudioChars.length; i++) {
    var span = _plAudioChars[i];
    var start = parseFloat(span.dataset.start);
    var end = parseFloat(span.dataset.end);
    if (currentTime >= end) {
      setPipelineKaraokeCharState(span, "spoken");
    } else if (currentTime >= start) {
      setPipelineKaraokeCharState(span, "current");
    } else {
      setPipelineKaraokeCharState(span, "unspoken");
    }
  }
}

function startPipelineKaraokeLoop(btn) {
  stopPipelineKaraokeLoop();
  resetPipelineKaraokeChars();
  if (!_plAudio || !btn) return;

  var row = btn.closest ? btn.closest("tr[data-seg]") : null;
  if (!row) return;

  _plAudioChars = Array.prototype.slice.call(row.querySelectorAll(".karaoke-char"));
  if (_plAudioChars.length === 0) return;

  function karaokeLoop() {
    if (!_plAudio || _plAudio.paused) {
      _plAudioRaf = 0;
      return;
    }
    updatePipelineKaraokeChars(_plAudio.currentTime || 0);
    _plAudioRaf = requestAnimationFrame(karaokeLoop);
  }

  updatePipelineKaraokeChars(_plAudio.currentTime || 0);
  _plAudioRaf = requestAnimationFrame(karaokeLoop);
}

function resetPipelineAudioPlayback(options) {
  stopPipelineKaraokeLoop();
  if (!options || !options.keepKaraokeState) {
    resetPipelineKaraokeChars();
  }
  if (_plAudio) {
    _plAudio.pause();
    _plAudio.onended = null;
    _plAudio.onerror = null;
    _plAudio = null;
  }
  if (_plAudioBtn) {
    setPipelineAudioButtonState(_plAudioBtn, false);
    _plAudioBtn = null;
  }
}

function playPipelineAudio(btn, filePath) {
  if (!btn || !filePath) return;
  var isSameButton = _plAudioBtn === btn && btn.classList.contains("playing");
  resetPipelineAudioPlayback();
  if (isSameButton) return;

  var url = buildPipelineMediaUrl(filePath);
  if (!url) return;
  console.log("[pipeline] playing audio:", url);
  try {
    _plAudio = new Audio(url);
    _plAudioBtn = btn;
    setPipelineAudioButtonState(btn, true);
    _plAudio.onerror = function() {
      console.error("[pipeline] audio error:", _plAudio && _plAudio.error);
      resetPipelineAudioPlayback();
    };
    var playPromise = _plAudio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.then(function() {
        console.log("[pipeline] audio playing!");
        startPipelineKaraokeLoop(btn);
      }).catch(function(e) {
        console.error("[pipeline] audio play promise rejected:", e.message);
        resetPipelineAudioPlayback();
      });
    } else {
      startPipelineKaraokeLoop(btn);
    }
    _plAudio.onended = function() {
      resetPipelineAudioPlayback({ keepKaraokeState: true });
    };
  } catch (e) {
    console.error("[pipeline] audio exception:", e.message);
    resetPipelineAudioPlayback();
  }
}

function playPipelineVideo(filePath) {
  if (!filePath) return;
  var url = buildPipelineMediaUrl(filePath);
  var name = filePath.split("/").pop() || "clip.mp4";
  openPlayer(name, url, filePath);
}

function populateEditorClipSidebar() {
  var list = document.getElementById("editor-clip-list");
  var count = document.getElementById("editor-clip-count");
  if (!list) return;
  if (!pipelineData || !pipelineData.script || !pipelineData.script.segments || pipelineData.script.segments.length === 0) {
    if (currentProject && currentEpisode) {
      bridgeCall("fs.read", { path: "~/NextFrame/projects/" + currentProject + "/" + currentEpisode + "/pipeline.json" }, 3000).then(function(result) {
        try { pipelineData = JSON.parse(result.contents); renderEditorClips(); } catch (_e) {}
      }).catch(function() {});
    }
    list.innerHTML = '<div style="padding:20px;color:rgba(228,228,232,0.25);font-size:12px;text-align:center">暂无片段</div>';
    if (count) count.textContent = "0";
    return;
  }
  renderEditorClips();
}

function renderEditorClips() {
  var list = document.getElementById("editor-clip-list");
  var countEl = document.getElementById("editor-clip-count");
  if (!list || !pipelineData) return;
  var segs = pipelineData.script.segments || [];
  var audioSegs = (pipelineData.audio || {}).segments || [];
  if (countEl) countEl.textContent = segs.length + " 个片段";
  var html = segs.map(function(seg, i) {
    var audio = audioSegs.find(function(a) { return a.segment === seg.segment; });
    var dur = audio && audio.duration ? audio.duration + "s" : "—";
    var role = seg.role ? seg.role + " — " : "";
    return '<div class="editor-clip-item' + (i === 0 ? ' active' : '') + '" onclick="selectEditorClip(this)">' +
      '<div class="editor-clip-name">' + escHtml(role + (seg.narration || '').substring(0, 12)) + '</div>' +
      '<div class="editor-clip-meta">段 ' + (seg.segment || i + 1) + ' · ' + dur + '</div>' +
    '</div>';
  }).join("");
  list.innerHTML = html;
}

function selectEditorClip(el) {
  document.querySelectorAll(".editor-clip-item").forEach(function(item) { item.classList.remove("active"); });
  el.classList.add("active");
}

function renderPipelineAudio(data) {
  var voice = escHtml(data.audio.voice);
  var speed = data.audio.speed;
  var segments = data.audio.segments;
  var scriptSegs = data.script.segments;

  var generated = segments.filter(function(s) { return s.status === 'generated'; });
  var totalDur = generated.reduce(function(sum, s) { return sum + (s.duration || 0); }, 0);

  // --- Toolbar ---
  var html = '<div class="pl-toolbar">';
  html += '<div class="pl-chip pl-chip-accent"><span class="pl-chip-label">\u58F0\u7EBF</span><span class="pl-chip-val">' + voice + '</span></div>';
  html += '<div class="pl-chip"><span class="pl-chip-label">\u8BED\u901F</span><span class="pl-chip-val">' + speed.toFixed(1) + 'x</span></div>';
  html += '<div class="pl-chip pl-chip-green"><span class="pl-chip-label">\u5DF2\u751F\u6210</span><span class="pl-chip-val">' + generated.length + '/' + segments.length + '</span></div>';
  html += '<div class="pl-chip"><span class="pl-chip-label">\u603B\u65F6\u957F</span><span class="pl-chip-val">' + totalDur.toFixed(1) + 's</span></div>';
  html += '<div class="pl-divider"></div>';
  html += '<span class="pl-seg-pill active" data-seg="-1" data-filter-seg="-1">\u5168\u90E8</span>';
  for (var i = 0; i < segments.length; i++) {
    html += '<span class="pl-seg-pill" data-seg="' + i + '" data-filter-seg="' + i + '">\u6BB5 ' + (i + 1) + '</span>';
  }
  html += '</div>';

  // --- Table ---
  html += '<div class="pl-table"><table><thead><tr>';
  html += '<th style="width:45%">\u6587\u6848</th>';
  html += '<th style="width:55%">\u97F3\u9891</th>';
  html += '</tr></thead><tbody>';

  for (var si = 0; si < segments.length; si++) {
    var seg = segments[si];
    var script = scriptSegs[si];
    var isGenerated = seg.status === 'generated';
    var trClass = isGenerated ? '' : ' class="seg-pending"';

    html += '<tr data-seg="' + si + '"' + trClass + '>';

    // Left column: narration
    html += '<td class="col-text">' + escHtml(script.narration) + '</td>';

    // Right column: audio metadata
    html += '<td class="col-audio">';
    html += '<div class="audio-head">';

    if (isGenerated) {
      // Play button
      var audioPath = seg.file ? ("~/NextFrame/projects/" + currentProject + "/" + currentEpisode + "/" + seg.file) : null;
      if (audioPath) {
        html += '<button class="pl-play-btn" data-audio-path="' + escHtml(audioPath) + '">&#9654;</button>';
      }
      html += '<span class="pl-tag-generated">\u5DF2\u751F\u6210</span>';
      html += '<span class="audio-duration">' + seg.duration.toFixed(1) + 's</span>';
    } else {
      html += '<span class="pl-tag-pending">\u5F85\u751F\u6210</span>';
    }

    html += '</div>';

    // Sentence rows (karaoke) - only for generated segments
    if (isGenerated && seg.sentences && seg.sentences.length > 0) {
      html += '<div class="sentence-list">';
      for (var j = 0; j < seg.sentences.length; j++) {
        var sent = seg.sentences[j];
        var startFmt = fmtTime(sent.start);
        var endFmt = fmtTime(sent.end);
        var durVal = (sent.end - sent.start).toFixed(1);

        html += '<div class="sentence-row">';
        html += '<span class="s-timecode">' + startFmt + ' <span class="s-arrow">&rarr;</span> ' + endFmt + '</span>';
        html += '<span class="s-text">' + renderPipelineKaraokeSentence(sent) + '</span>';
        html += '<span class="s-dur">' + durVal + 's</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    html += '</td></tr>';
  }

  html += '</tbody></table></div>';

  return html;
}

function fmtTime(sec) {
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  var mm = (m < 10 ? '0' : '') + m;
  var whole = Math.floor(s);
  var frac = Math.round((s - whole) * 10);
  var ss = (whole < 10 ? '0' : '') + whole;
  return mm + ':' + ss + '.' + frac;
}

function renderPipelineKaraokeSentence(sentence) {
  if (!sentence || !sentence.words || sentence.words.length === 0) {
    return escHtml(sentence && sentence.text || "");
  }

  var html = "";
  for (var i = 0; i < sentence.words.length; i++) {
    var word = sentence.words[i] || {};
    var charText = word.char == null ? "" : String(word.char);
    if (!charText) continue;
    html += '<span class="karaoke-char unspoken" data-start="' + escHtml(String(word.start == null ? 0 : word.start)) + '" data-end="' + escHtml(String(word.end == null ? 0 : word.end)) + '">' + escHtml(charText) + '</span>';
  }

  return html || escHtml(sentence.text || "");
}

function renderPipelineClips(data) {
  var atoms = (data.atoms || []).filter(function (a) { return a.type === 'video'; });

  var header =
    '<div class="clip-list-header" style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.06);' +
    'font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(228,228,232,0.5)">' +
    'VIDEO CLIPS &middot; ' + atoms.length +
    '</div>';

  var rows = '';
  atoms.forEach(function (a) {
    var dur = (typeof a.duration === 'number') ? a.duration.toFixed(1) : '0.0';

    // --- status tags ---
    var tags = '';

    // subtitle tag
    if (a.subtitles && a.subtitles.length > 0) {
      tags += '<span class="pl-tag-generated" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;background:rgba(224,160,64,0.12);color:#e0a040">' +
        escHtml('字幕✓') + '</span>';
    } else {
      tags += '<span class="pl-tag-pending" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;background:rgba(228,228,232,0.05);color:rgba(228,228,232,0.25)">' +
        escHtml('无字幕') + '</span>';
    }

    // timeline tag
    if (a.hasTl) {
      tags += '<span class="pl-tag-generated" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;background:rgba(124,106,239,0.06);color:#7c6aef">' +
        escHtml('时间轴✓') + '</span>';
    } else {
      tags += '<span class="pl-tag-pending" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;background:rgba(228,228,232,0.05);color:rgba(228,228,232,0.25)">' +
        escHtml('无时间轴') + '</span>';
    }

    // segment tag
    if (a.segment != null) {
      tags += '<span class="pl-tag-generated" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;font-family:\'SF Mono\',Menlo,monospace;background:rgba(124,106,239,0.15);color:#7c6aef">' +
        escHtml('段' + a.segment) + '</span>';
    }

    // --- thumbnail with play button ---
    var videoPath = a.file ? ("~/NextFrame/projects/" + currentProject + "/" + currentEpisode + "/" + a.file) : null;
    var playBtn = videoPath ? '<button class="pl-play-btn" style="width:24px;height:24px;font-size:9px" data-video-path="' + escHtml(videoPath) + '">&#9654;</button>' : '<span style="font-size:11px;color:rgba(228,228,232,0.25)">16:9</span>';
    var thumb =
      '<div style="width:100px;height:56px;background:#111114;border-radius:4px;flex-shrink:0;' +
      'display:flex;align-items:center;justify-content:center">' +
      playBtn + '</div>';

    // --- row ---
    rows +=
      '<div class="clip-row" style="display:flex;align-items:center;gap:12px;padding:7px 10px;' +
      'border-radius:6px;border:1px solid transparent">' +
        thumb +
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">' +
          '<span style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            escHtml(a.name) +
          '</span>' +
          '<span style="font-family:\'SF Mono\',Menlo,monospace;font-size:11px;color:rgba(228,228,232,0.5);' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            escHtml(a.file || '') +
          '</span>' +
        '</div>' +
        '<span style="font-family:\'SF Mono\',Menlo,monospace;font-size:11px;color:#7c6aef;white-space:nowrap;flex-shrink:0">' +
          escHtml(dur + 's') +
        '</span>' +
        '<div style="display:flex;gap:4px;flex-shrink:0;align-items:center">' +
          tags +
        '</div>' +
      '</div>';
  });

  return header + '<div class="clip-list" style="padding:6px 20px">' + rows + '</div>';
}

function renderPipelineAtoms(data) {
  var atoms = data.atoms || [];

  var counts = { all: atoms.length, component: 0, video: 0, image: 0 };
  atoms.forEach(function(a) { if (counts[a.type] !== undefined) counts[a.type]++; });

  var typeLabels = { component: '组件', video: '视频', image: '图片' };

  // --- Toolbar ---
  var html = '<div class="pl-toolbar">';
  html += '<span class="pl-seg-pill active" data-filter-type="all">全部 ' + counts.all + '</span>';
  html += '<span class="pl-seg-pill" data-filter-type="component">' + typeLabels.component + ' ' + counts.component + '</span>';
  html += '<span class="pl-seg-pill" data-filter-type="video">' + typeLabels.video + ' ' + counts.video + '</span>';
  html += '<span class="pl-seg-pill" data-filter-type="image">' + typeLabels.image + ' ' + counts.image + '</span>';
  html += '</div>';

  // --- Grid ---
  html += '<div class="pl-atoms-grid">';
  atoms.forEach(function(a) {
    var typeClass = a.type; // component | video | image
    var typeLabel = typeLabels[a.type] || a.type;

    // Build info / description line
    var desc = '';
    if (a.type === 'component') {
      desc = 'scene &middot; ' + escHtml(a.scene || a.name) + '.js';
    } else if (a.type === 'video') {
      var parts = [];
      if (a.duration != null) parts.push(a.duration + 's');
      if (a.dimensions) parts.push(a.dimensions);
      desc = parts.join(' &middot; ');
    } else if (a.type === 'image') {
      var parts = [];
      if (a.dimensions) parts.push(a.dimensions);
      if (a.size) parts.push(a.size);
      desc = parts.join(' &middot; ');
    }

    html += '<div class="pl-atom-card" data-type="' + escHtml(a.type) + '">';

    // Preview area
    html += '<div class="pl-atom-preview">';
    if (a.type === 'component') {
      html += '<span>' + escHtml(a.scene || a.name) + '</span>';
    } else {
      html += '<span>' + escHtml(a.file || a.name) + '</span>';
    }
    html += '</div>';

    // Info area
    html += '<div class="pl-atom-info">';

    // Name + type tag row
    html += '<div class="pl-atom-name">';
    html += '<span>' + escHtml(a.name) + '</span>';
    html += '<span class="pl-atom-type-tag ' + typeClass + '">' + escHtml(typeLabel) + '</span>';
    if (a.segment != null) {
      html += '<span class="pl-atom-seg">段 ' + escHtml(String(a.segment)) + '</span>';
    }
    html += '</div>';

    // Description
    if (desc) {
      html += '<div class="pl-atom-desc">' + desc + '</div>';
    }

    // File path for video/image
    if (a.file && (a.type === 'video' || a.type === 'image')) {
      html += '<div class="pl-atom-path">' + escHtml(a.file) + '</div>';
    }

    html += '</div>'; // .pl-atom-info
    html += '</div>'; // .pl-atom-card
  });
  html += '</div>';

  return html;
}

function renderPipelineOutput(data) {
  var outputs = (data.outputs || []).slice().sort(function(a, b) { return b.id - a.id; });
  var count = outputs.length;

  var html = '<div class="pl-outputs">';

  // Header
  html += '<div class="count-bar"><span>' + escHtml(String(count)) + ' 个版本</span></div>';

  // Version cards
  for (var i = 0; i < outputs.length; i++) {
    var o = outputs[i];
    var specs = o.specs || {};
    var published = o.published || [];
    var dateStr = '';
    if (o.date) {
      var d = new Date(o.date);
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      dateStr = d.getFullYear() + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
    }

    html += '<div class="pl-output-card">';

    // Thumbnail
    html += '<div class="pl-output-thumb"><span class="v-thumb-play">&#x25B6;</span></div>';

    // Info
    html += '<div class="pl-output-info">';
    html += '<div class="pl-output-name">' + escHtml(o.name || '') + '</div>';
    html += '<div class="pl-output-date">' + escHtml(dateStr) + '</div>';

    // Spec tags
    html += '<div class="pl-output-specs">';
    if (specs.width && specs.height) {
      html += '<span class="spec-tag pl-spec-res">' + escHtml(specs.width + '\u00d7' + specs.height) + '</span>';
    }
    if (specs.fps) {
      html += '<span class="spec-tag pl-spec-fps">' + escHtml(specs.fps + 'fps') + '</span>';
    }
    if (specs.codec) {
      html += '<span class="spec-tag pl-spec-codec">' + escHtml(specs.codec) + '</span>';
    }
    if (o.duration != null) {
      html += '<span class="spec-tag pl-spec-dur">' + escHtml(o.duration + 's') + '</span>';
    }
    if (o.size) {
      html += '<span class="spec-tag pl-spec-size">' + escHtml(o.size) + '</span>';
    }
    html += '</div>';

    // Changes
    if (o.changes) {
      html += '<div class="pl-output-changes">' + escHtml(o.changes) + '</div>';
    }

    // File path
    if (o.file) {
      html += '<div class="pl-meta-path">' + escHtml(o.file) + '</div>';
    }

    html += '</div>'; // pl-output-info

    // Publish status
    html += '<div class="pl-output-status">';
    if (published.length > 0) {
      for (var j = 0; j < published.length; j++) {
        html += '<span class="pl-tag-published">' + escHtml(published[j].platform) + ' \u2713</span>';
      }
    } else {
      html += '<span class="pl-tag-unpublished">未发布</span>';
    }
    html += '</div>';

    html += '</div>'; // pl-output-card
  }

  html += '</div>'; // pl-outputs
  return html;
}

function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "\&lt;").replace(/>/g, "\&gt;").replace(/"/g, "\&quot;");
}

function initBreadcrumbNavigation() {
  const projectLabel = document.getElementById("bc-show-label");
  if (projectLabel) {
    projectLabel.addEventListener("click", function(event) {
      event.stopPropagation();
      if (currentProject) {
        void goProject(currentProject);
      } else {
        goHome();
      }
    });
  }

  const episodeLabel = document.getElementById("bc-ep-label");
  if (episodeLabel) {
    episodeLabel.addEventListener("click", function(event) {
      event.stopPropagation();
      if (currentProject && currentEpisode) {
        void goEditor(currentProject, currentEpisode, null);
      } else if (currentProject) {
        void goProject(currentProject);
      } else {
        goHome();
      }
    });
  }

  const segmentLabel = document.getElementById("bc-scene-label");
  if (segmentLabel) {
    segmentLabel.addEventListener("click", function(event) {
      event.stopPropagation();
      if (currentProject && currentEpisode) {
        void goEditor(currentProject, currentEpisode, currentSegment);
      }
    });
  }
}

function handleKeydown(event) {
  if (event.code === "Space" && !event.target.matches("input,textarea")) {
    event.preventDefault();
    togglePlay();
  }

  if (event.key === "Escape") {
    closeAllDropdowns();
    const editorView = document.getElementById("view-editor");
    if (editorView.classList.contains("fullscreen")) {
      toggleFullscreen();
    }
  }
}
