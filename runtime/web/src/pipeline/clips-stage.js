/* === pipeline/clips-stage.js — sidebar + detail layout (v0.4 prototype match) === */

/* ─── Utility: safe number ─── */
function pipelineClipNumber(value, fallback) {
  const next = Number(value);
  return isFinite(next) ? next : fallback;
}

/* ─── Utility: format timecode MM:SS.t ─── */
function formatPipelineClipTime(seconds) {
  const safe = Math.max(0, pipelineClipNumber(seconds, 0));
  let minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  let wholeSeconds = Math.floor(remainder);
  let tenths = Math.round((remainder - wholeSeconds) * 10);
  if (tenths === 10) { tenths = 0; wholeSeconds += 1; }
  if (wholeSeconds === 60) { wholeSeconds = 0; minutes += 1; }
  return String(minutes).padStart(2, "0") + ":" + String(wholeSeconds).padStart(2, "0") + "." + tenths;
}

/* ─── Extract helpers ─── */
function getPipelineClipResolution(atom) {
  if (atom.width && atom.height) return atom.width + "\u00d7" + atom.height;
  if (atom.dimensions) return String(atom.dimensions).replace(/[xX]/g, "\u00d7");
  if (atom.resolution) return String(atom.resolution).replace(/[xX]/g, "\u00d7");
  return "--";
}
function getPipelineClipFps(atom) {
  const fps = atom.fps != null ? atom.fps : (atom.frameRate != null ? atom.frameRate : atom.frame_rate);
  if (fps == null || fps === "") return "--fps";
  return String(fps).replace(/fps$/i, "") + "fps";
}
function getPipelineClipFpsNumber(atom) {
  const fps = atom.fps != null ? atom.fps : (atom.frameRate != null ? atom.frameRate : atom.frame_rate);
  return pipelineClipNumber(fps, 30);
}
function getPipelineClipCodec(atom) {
  return atom.codec || atom.videoCodec || atom.format || "unknown";
}
function getPipelineClipSize(atom) {
  return atom.size || atom.fileSize || atom.filesize || "--";
}

function getPipelineClipSourceId(atom) {
  if (!atom) return null;
  let sourceId = atom.sourceId;
  if (sourceId == null) sourceId = atom.source_id;
  if (sourceId == null) sourceId = atom.parentSourceId;
  if (sourceId == null) sourceId = atom.parent_source_id;
  if (sourceId == null && atom.source != null && typeof atom.source !== "object") {
    sourceId = atom.source;
  }
  const numeric = Number(sourceId);
  return isFinite(numeric) ? numeric : null;
}

function pipelineClipMatchesSource(video, sourceVideo) {
  if (!video || !sourceVideo) return false;
  if (video.isSource) return false;
  if (video.sourceId != null && sourceVideo.atom && sourceVideo.atom.id != null) {
    return video.sourceId === Number(sourceVideo.atom.id);
  }
  if (/^clips\//.test(video.file) && /^sources\//.test(sourceVideo.file)) {
    return video.file !== sourceVideo.file;
  }
  return false;
}

/* ─── Build absolute path ─── */
function buildPipelineClipAbsolutePath(filePath) {
  const relativePath = String(filePath || "");
  if (!relativePath) return "";
  if (relativePath.indexOf(PIPELINE_PROJECTS_ROOT) === 0) return relativePath;
  let base = PIPELINE_PROJECTS_ROOT;
  if (currentProject) base += currentProject + "/";
  if (currentEpisode) base += currentEpisode + "/";
  return base + relativePath.replace(/^\/+/, "");
}

/* ─── Extract video list from atoms ─── */
function getPipelineClipVideos(data) {
  return (data.atoms || []).filter(function(atom) {
    return atom && atom.type === "video";
  }).map(function(atom, index) {
    const filePath = String(atom.file || "");
    const durationSeconds = Math.max(0, pipelineClipNumber(atom.duration, 0));
    const isSource = atom.isSource === true || /^sources\//.test(filePath);
    const inPoint = pipelineClipNumber(
      atom.inSec != null ? atom.inSec : (atom.in_point != null ? atom.in_point : atom.inPoint),
      0
    );
    let outPoint = pipelineClipNumber(
      atom.outSec != null ? atom.outSec : (atom.out_point != null ? atom.out_point : atom.outPoint),
      durationSeconds
    );
    if (!isSource && outPoint <= inPoint && durationSeconds > 0) {
      outPoint = inPoint + durationSeconds;
    }
    return {
      atom: atom,
      index: index,
      id: pipelineClipNumber(atom.id, index),
      name: atom.name || filePath.split("/").pop() || ("Clip " + (index + 1)),
      file: filePath,
      absolutePath: buildPipelineClipAbsolutePath(filePath),
      durationSeconds: durationSeconds,
      durationLabel: formatPipelineClipTime(durationSeconds),
      resolution: getPipelineClipResolution(atom),
      fps: getPipelineClipFps(atom),
      fpsNum: getPipelineClipFpsNumber(atom),
      codec: getPipelineClipCodec(atom),
      size: getPipelineClipSize(atom),
      isSource: isSource,
      sourceId: getPipelineClipSourceId(atom),
      inPoint: inPoint,
      outPoint: outPoint,
      hasSubs: !!(atom.subtitles && atom.subtitles.length > 0),
      hasTimeline: !!(atom.timeline_aligned || atom.timelineAligned || atom.has_timeline),
      segment: atom.segment
    };
  });
}

/* ─── Group clips by source ─── */
function getPipelineClipsBySource(videos) {
  const sources = [];
  const clipsBySource = {};
  videos.forEach(function(v) {
    if (v.isSource) {
      sources.push(v);
      clipsBySource[v.index] = [];
    }
  });
  // Derive parent source for non-source clips by matching file path prefix or atom.source
  videos.forEach(function(v) {
    if (!v.isSource) {
      let parentIdx = -1;
      if (v.atom.source != null) {
        parentIdx = pipelineClipNumber(v.atom.source, -1);
      }
      if (parentIdx < 0) {
        // fallback: attach to first source
        if (sources.length > 0) parentIdx = sources[0].index;
      }
      if (clipsBySource[parentIdx]) {
        clipsBySource[parentIdx].push(v);
      }
    }
  });
  return { sources: sources, clipsBySource: clipsBySource };
}

/* ─── Expanded clip state (global, managed by index.js event binding) ─── */
if (typeof pipelineClipsExpandedClip === "undefined") {
  let pipelineClipsExpandedClip = -1;
}

/* ─── Render clip detail panel (expanded view for a single clip) ─── */
function renderClipDetail(video, sourceVideo) {
  const atom = video.atom;
  const src = sourceVideo || video;
  const inPt = video.inPoint;
  const outPt = video.outPoint;
  let dur = outPt - inPt;
  if (dur <= 0) dur = video.durationSeconds;
  const fpsNum = video.fpsNum || src.fpsNum || 30;
  const frames = Math.round(dur * fpsNum);
  const srcDur = src.durationSeconds || dur;

  // IN/OUT as pct of source for precision bar
  const inPct = srcDur > 0 ? (inPt / srcDur * 100) : 0;
  const outPct = srcDur > 0 ? (outPt / srcDur * 100) : 100;
  const fillWidth = outPct - inPct;
  const playheadPct = inPct + fillWidth * 0.35; // static 35% into clip

  // Zoom ticks
  const zoomTicks = [];
  const zStep = dur <= 20 ? 2 : (dur <= 60 ? 5 : 10);
  for (let zt = inPt; zt <= outPt; zt += zStep) {
    zoomTicks.push('<span>' + escHtml(formatPipelineClipTime(zt)) + '</span>');
  }
  if (Math.abs(outPt - (inPt + Math.floor((outPt - inPt) / zStep) * zStep)) > 0.5) {
    zoomTicks.push('<span>' + escHtml(formatPipelineClipTime(outPt)) + '</span>');
  }

  // Subtitle track
  const subs = atom.subtitles || [];
  let subHtml = "";
  if (subs.length > 0) {
    subHtml = '<div class="cd-subs">' +
      '<div class="cd-subs-label">SUBTITLES <span class="cd-subs-tag on">\u5361\u62C9OK \u2713</span>' +
      '<span style="margin-left:auto;font-family:var(--mono,\'SF Mono\',Menlo,monospace);font-size:11px;color:rgba(228,228,232,0.5)">' + subs.length + ' \u53E5</span></div>' +
      '<div class="cd-sub-lines">';
    subs.forEach(function(sub) {
      const subStart = pipelineClipNumber(sub.start != null ? sub.start : sub.s, 0);
      const subEnd = pipelineClipNumber(sub.end != null ? sub.end : sub.e, subStart);
      const subText = sub.text || sub.t || "";
      const charDur = subText.length > 0 ? ((subEnd - subStart) / subText.length) : 0;
      const charsHtml = subText.split("").map(function(ch, ci) {
        const ct = (subStart + ci * charDur).toFixed(2);
        return '<span class="char" title="' + ct + 's">' + escHtml(ch) + '</span>';
      }).join("");
      subHtml += '<div class="cd-sub-line">' +
        '<span class="cd-sub-tc">' + escHtml(formatPipelineClipTime(subStart)) + ' \u2192 ' + escHtml(formatPipelineClipTime(subEnd)) + '</span>' +
        '<span class="cd-sub-text">' + charsHtml + '</span>' +
        '<span class="cd-sub-dur">' + (subEnd - subStart).toFixed(1) + 's</span>' +
      '</div>';
    });
    subHtml += '</div></div>';
  } else {
    subHtml = '<div class="cd-subs">' +
      '<div class="cd-subs-label">SUBTITLES <span class="cd-subs-tag off">\u65E0\u5B57\u5E55</span></div>' +
      '<div class="cd-sub-none" style="padding:0 10px 4px">\u6682\u65E0\u5B57\u5E55 \u2014 nextframe sub-import</div>' +
    '</div>';
  }

  // Play button for large preview
  const previewPlayBtn = video.absolutePath
    ? '<div class="cd-play-center" data-video-path="' + escHtml(video.absolutePath) + '">&#9654;</div>'
    : '<div class="cd-play-center">&#9654;</div>';

  // Expand (fullscreen modal) button
  const expandBtn = video.absolutePath
    ? '<div class="cd-expand-btn" data-video-path="' + escHtml(video.absolutePath) + '" data-fullscreen="1">&#x26F6;</div>'
    : '';

  return (
    '<div class="clip-detail show" style="border-bottom:1px solid rgba(255,255,255,0.06)">' +
      /* Large 16:9 preview */
      '<div class="cd-preview-wrap">' +
        '<div class="cd-preview">' +
          previewPlayBtn +
          '<div class="cd-tc-overlay">' + escHtml(formatPipelineClipTime(inPt)) + ' \u2192 ' + escHtml(formatPipelineClipTime(outPt)) + '</div>' +
        '</div>' +
        expandBtn +
        '<div class="cd-progress-bar"><div class="cd-progress-fill" style="width:0"></div></div>' +
      '</div>' +

      /* Precision zoom timeline */
      '<div class="cd-zoom">' +
        '<div class="cd-zoom-label"><span>TIMELINE</span><span>' + escHtml(dur.toFixed(1) + 's \u00b7 ' + frames + ' frames') + '</span></div>' +
        '<div class="cd-zoom-bar">' +
          '<div class="cd-zoom-fill" style="left:' + inPct.toFixed(1) + '%;width:' + fillWidth.toFixed(1) + '%"></div>' +
          '<div class="cd-zoom-handle in" style="left:' + inPct.toFixed(1) + '%"></div>' +
          '<div class="cd-zoom-handle out" style="left:' + outPct.toFixed(1) + '%"></div>' +
          '<div class="cd-zoom-playhead" style="left:' + playheadPct.toFixed(1) + '%"></div>' +
        '</div>' +
        '<div class="cd-zoom-ticks">' + zoomTicks.join("") + '</div>' +
      '</div>' +

      /* Subtitle track */
      subHtml +

      /* Metadata */
      '<div class="cd-meta">' +
        '<div class="cd-meta-item"><div class="cd-meta-label">IN</div><div class="cd-meta-value">' + escHtml(formatPipelineClipTime(inPt)) + '</div></div>' +
        '<div class="cd-meta-item"><div class="cd-meta-label">OUT</div><div class="cd-meta-value">' + escHtml(formatPipelineClipTime(outPt)) + '</div></div>' +
        '<div class="cd-meta-item"><div class="cd-meta-label">FRAMES</div><div class="cd-meta-value">' + escHtml(String(frames)) + '</div></div>' +
        '<div class="cd-meta-item"><div class="cd-meta-label">\u65F6\u95F4\u8F74</div><div class="cd-meta-value" style="color:' + (video.hasTimeline ? '#7c6aef' : 'rgba(228,228,232,0.25)') + '">' +
          (video.hasTimeline ? '\u2713 \u5DF2\u5BF9\u9F50' : '\u672A\u5BF9\u9F50') + '</div></div>' +
        (video.segment != null ? '<div class="cd-meta-item"><div class="cd-meta-label">\u6BB5\u843D</div><div class="cd-meta-value" style="color:#7c6aef">' + escHtml(String(video.segment)) + '</div></div>' : '') +
      '</div>' +

      /* Absolute path */
      '<div class="cd-path">' + escHtml(video.absolutePath || video.file || "") + '</div>' +
    '</div>'
  );
}

/* ─── Main render: sidebar sources + clip list with expandable detail ─── */
function renderPipelineClips(data) {
  const videos = getPipelineClipVideos(data);
  if (videos.length === 0) {
    return '<div class="pipeline-empty">\u6682\u65E0\u7D20\u6750 \u2014 nextframe atom-add --type=video</div>';
  }

  const sources = videos.filter(function(v) { return v.isSource; });
  if (sources.length === 0) {
    return (
      '<div class="pipeline-clips">' +
        '<div class="clips-sources">' +
          '<div class="clips-sources-header">SOURCES · 0</div>' +
          '<div class="clips-empty-note" style="padding:12px;">No source videos</div>' +
        '</div>' +
        '<div class="clips-main">' +
          '<div class="pipeline-empty">No source videos found. Add atoms with <span style="font-family:\'SF Mono\', Menlo, monospace;">isSource: true</span>.</div>' +
        '</div>' +
      '</div>'
    );
  }

  if (pipelineClipsSelectedIndex < 0 || pipelineClipsSelectedIndex >= videos.length) {
    pipelineClipsSelectedIndex = sources[0].index;
  }

  let selected = videos[pipelineClipsSelectedIndex];
  if (!selected || !selected.isSource) {
    selected = sources[0];
    pipelineClipsSelectedIndex = selected.index;
  }

  const selectedClips = videos.filter(function(video) {
    return pipelineClipMatchesSource(video, selected);
  });

  const sourceItemsHtml = sources.map(function(video) {
    const clipCount = videos.filter(function(clip) {
      return pipelineClipMatchesSource(clip, video);
    }).length;
    const inlinePlayBtn = video.absolutePath
      ? '<button class="pl-play-btn clips-inline-play" data-video-path="' + escHtml(video.absolutePath) + '" title="Inline preview">&#9654;</button>'
      : '';
    const fullscreenBtn = video.absolutePath
      ? '<button class="clips-fs-btn" data-video-path="' + escHtml(video.absolutePath) + '" data-fullscreen="1" title="Fullscreen">&#x26F6;</button>'
      : '';
    return (
      '<div class="clips-src-item' + (video.index === selected.index ? ' active' : '') + '" data-idx="' + video.index + '">' +
        '<div class="clips-src-thumb">' +
          inlinePlayBtn +
          fullscreenBtn +
          '<span class="clips-src-dur">' + escHtml(video.durationLabel) + '</span>' +
        '</div>' +
        '<div class="clips-src-info">' +
          '<div class="clips-src-name">' + escHtml(video.name) + '</div>' +
          '<div class="clips-src-meta">' + escHtml(video.durationLabel + ' \u00b7 ' + video.resolution + ' \u00b7 ' + video.size) + '</div>' +
          '<div class="clips-src-count">' + escHtml(String(clipCount) + ' clips') + '</div>' +
        '</div>' +
      '</div>'
    );
  }).join("");

  // ─── Main panel: source header with colored spec tags ───
  const headerHtml =
    '<div class="clips-head">' +
      '<div class="clips-head-row">' +
        '<span class="clips-head-name">' + escHtml(selected.name) + '</span>' +
        '<span class="clips-specs">' +
          '<span class="clips-spec-tag res">' + escHtml(selected.resolution) + '</span>' +
          '<span class="clips-spec-tag fps">' + escHtml(selected.fps) + '</span>' +
          '<span class="clips-spec-tag codec">' + escHtml(selected.codec) + '</span>' +
          '<span class="clips-spec-tag dur">' + escHtml(selected.durationLabel) + '</span>' +
          '<span class="clips-spec-tag size">' + escHtml(selected.size) + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="clips-path">' + escHtml(selected.absolutePath || selected.file || "") + '</div>' +
    '</div>';

  // ─── Full timeline bar (all clips on source) ───
  const relatedClips = selectedClips;
  const timelineSpan = Math.max(selected.durationSeconds, 1);

  const timelineBlocksHtml = relatedClips.map(function(video) {
    const srcDur = timelineSpan;
    const left = srcDur > 0 ? (video.inPoint / srcDur * 100) : 0;
    let width = srcDur > 0 ? ((video.outPoint - video.inPoint) / srcDur * 100) : 10;
    if (width < 1) width = 1;
    return (
      '<div class="clips-timeline-block' + (pipelineClipsExpandedClip === video.index ? ' selected' : '') + '" data-clips-idx="' + video.index + '" style="left:' + left.toFixed(2) + '%;width:' + width.toFixed(2) + '%">' +
        escHtml(video.segment != null ? "SEG " + video.segment : video.name) +
      '</div>'
    );
  }).join("");

  const timelineTicks = [];
  for (let tickIndex = 0; tickIndex <= 4; tickIndex++) {
    timelineTicks.push('<span>' + escHtml(formatPipelineClipTime((timelineSpan * tickIndex) / 4)) + '</span>');
  }

  const timelineHtml =
    '<div class="clips-timeline">' +
      '<div class="clips-section-label"><span>TIMELINE</span><span>' + escHtml("Source: " + selected.name) + '</span></div>' +
      '<div class="clips-timeline-bar">' + timelineBlocksHtml + '</div>' +
      '<div class="clips-timeline-ticks">' + timelineTicks.join("") + '</div>' +
    '</div>';

  // ─── Clip rows: only clips from selected source ───
  const allClips = selectedClips;

  const clipRowsHtml = allClips.map(function(video) {
    const isExpanded = pipelineClipsExpandedClip === video.index;
    const dur = video.outPoint > video.inPoint ? (video.outPoint - video.inPoint) : video.durationSeconds;

    // Status tags
    const subTag = video.hasSubs
      ? '<span class="cr-status-tag sub-yes">\u5B57\u5E55 \u2713</span>'
      : '<span class="cr-status-tag sub-no">\u65E0\u5B57\u5E55</span>';
    const tlTag = video.hasTimeline
      ? '<span class="cr-status-tag tl-yes">\u65F6\u95F4\u8F74 \u2713</span>'
      : '<span class="cr-status-tag tl-no">\u65E0\u65F6\u95F4\u8F74</span>';
    const segTag = video.segment != null
      ? '<span class="cr-status-tag seg">' + escHtml(String(video.segment)) + '</span>'
      : '';

    let rowHtml =
      '<div class="clip-row' + (isExpanded ? ' selected' : '') + '" data-clips-idx="' + video.index + '">' +
        '<div class="clips-row-thumb-mini">' +
          (video.absolutePath
            ? '<button class="pl-play-btn clips-mini-play" data-video-path="' + escHtml(video.absolutePath) + '">&#9654;</button>'
            : '<span class="clips-dim-label">16:9</span>') +
        '</div>' +
        '<div class="cr-info">' +
          '<span class="cr-name">' + escHtml(video.name) + '</span>' +
          '<span class="cr-range">' + escHtml(formatPipelineClipTime(video.inPoint) + ' \u2192 ' + formatPipelineClipTime(video.outPoint)) + '</span>' +
          '<span class="cr-dur">' + escHtml(dur.toFixed(1) + 's') + '</span>' +
        '</div>' +
        '<div class="cr-status-tags">' + subTag + tlTag + segTag + '</div>' +
      '</div>';

    // Expanded detail panel
    if (isExpanded) {
      rowHtml += renderClipDetail(video, selected);
    }

    return rowHtml;
  }).join("");

  const clipsSectionLabel = allClips.length + ' CLIPS';

  return (
    '<div class="pipeline-clips">' +
      '<div class="clips-sources">' +
        '<div class="clips-sources-header">SOURCES \u00b7 ' + escHtml(String(sources.length)) + '</div>' +
        '<div class="clips-sources-list">' + sourceItemsHtml + '</div>' +
      '</div>' +
      '<div class="clips-main">' +
        '<div class="clips-main-scroll">' +
          headerHtml +
          timelineHtml +
          '<div class="clips-rows">' +
            '<div class="clips-section-label"><span>' + escHtml(clipsSectionLabel) + '</span><span>' + escHtml(String(allClips.length)) + '</span></div>' +
            (clipRowsHtml || '<div class="clips-empty-note">No clips</div>') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}
