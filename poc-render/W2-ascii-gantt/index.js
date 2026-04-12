"use strict";

const MAX_WIDTH = 80;
const MIN_CHART_WIDTH = 32;
const DESIRED_TICKS = 10;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function truncateText(text, width) {
  const value = String(text ?? "");
  if (width <= 0) {
    return "";
  }
  if (value.length <= width) {
    return value;
  }
  if (width <= 3) {
    return value.slice(0, width);
  }
  return `${value.slice(0, width - 3)}...`;
}

function padRight(text, width) {
  return truncateText(text, width).padEnd(width, " ");
}

function formatDuration(seconds, withTenths) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);

  if (withTenths) {
    const totalTenths = Math.round(safeSeconds * 10);
    const wholeMinutes = Math.floor(totalTenths / 600);
    const secondsTenths = totalTenths % 600;
    const wholeSeconds = Math.floor(secondsTenths / 10);
    const tenths = secondsTenths % 10;
    return `${wholeMinutes}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
  }

  const rounded = Math.round(safeSeconds);
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function buildSummaryLine(title, duration, trackCount, clipCount, chapterCount) {
  const suffix = ` · ${formatDuration(duration, true)} · ${trackCount} tracks · ${clipCount} clips · ${chapterCount} chapters`;
  const available = Math.max(8, MAX_WIDTH - suffix.length);
  return `${truncateText(title, available)}${suffix}`;
}

function normalizeTrackId(track, index) {
  return String(track.id || track.name || track.trackId || `T${index + 1}`);
}

function normalizeClip(clip, index, duration) {
  const start = Number.isFinite(clip.start) ? clip.start : 0;
  const clipDuration = Number.isFinite(clip.duration) ? clip.duration : null;
  const rawEnd = Number.isFinite(clip.end)
    ? clip.end
    : clipDuration !== null
      ? start + clipDuration
      : start;
  const safeStart = clamp(start, 0, duration);
  const safeEnd = clamp(rawEnd, safeStart, duration);

  return {
    id: clip.id || clip.clipId || `clip-${index + 1}`,
    label: String(
      clip.name ||
        clip.label ||
        clip.sceneId ||
        clip.asset ||
        clip.id ||
        clip.clipId ||
        `clip-${index + 1}`
    ),
    start: safeStart,
    end: safeEnd,
  };
}

function normalizeMarker(marker, index, duration) {
  return {
    id: marker.id || `marker-${index + 1}`,
    label: String(marker.label || marker.name || marker.id || `marker-${index + 1}`),
    time: clamp(Number.isFinite(marker.time) ? marker.time : 0, 0, duration),
    trackId: marker.trackId || marker.track || null,
  };
}

function normalizeChapter(chapter, index, duration) {
  const start = clamp(Number.isFinite(chapter.start) ? chapter.start : 0, 0, duration);
  const endBase = Number.isFinite(chapter.end)
    ? chapter.end
    : Number.isFinite(chapter.duration)
      ? start + chapter.duration
      : duration;

  return {
    id: chapter.id || `chapter-${index + 1}`,
    label: String(chapter.label || chapter.name || chapter.id || `chapter-${index + 1}`),
    start,
    end: clamp(endBase, start, duration),
  };
}

function normalizeTimeline(timeline) {
  const title = String(timeline.title || timeline.name || timeline.id || "Untitled Timeline");
  const duration = Number.isFinite(timeline.duration) && timeline.duration > 0 ? timeline.duration : 1;
  const trackMap = new Map();
  const orderedTrackIds = [];
  const unassignedMarkers = [];

  if (Array.isArray(timeline.tracks)) {
    timeline.tracks.forEach((track, index) => {
      const id = normalizeTrackId(track, index);
      orderedTrackIds.push(id);
      trackMap.set(id, {
        id,
        type: track.type || null,
        clips: (track.clips || []).map((clip, clipIndex) => normalizeClip(clip, clipIndex, duration)),
        markers: (track.markers || []).map((marker, markerIndex) =>
          normalizeMarker({ ...marker, trackId: id }, markerIndex, duration)
        ),
      });
    });
  }

  if (Array.isArray(timeline.clips)) {
    timeline.clips.forEach((clip, index) => {
      const trackId = String(clip.trackId || clip.track || clip.layer || "T1");
      if (!trackMap.has(trackId)) {
        orderedTrackIds.push(trackId);
        trackMap.set(trackId, { id: trackId, type: null, clips: [], markers: [] });
      }
      trackMap.get(trackId).clips.push(normalizeClip(clip, index, duration));
    });
  }

  const globalMarkers = Array.isArray(timeline.markers)
    ? timeline.markers.map((marker, index) => normalizeMarker(marker, index, duration))
    : [];

  for (const marker of globalMarkers) {
    if (marker.trackId && trackMap.has(marker.trackId)) {
      trackMap.get(marker.trackId).markers.push(marker);
      continue;
    }
    unassignedMarkers.push(marker);
  }

  const tracks = orderedTrackIds.map((id) => {
    const track = trackMap.get(id);
    return {
      id,
      type: track.type,
      clips: [...track.clips].sort((a, b) => a.start - b.start || a.end - b.end),
      markers: [...track.markers].sort((a, b) => a.time - b.time),
    };
  });

  const chapters = (timeline.chapters || [])
    .map((chapter, index) => normalizeChapter(chapter, index, duration))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    title,
    duration,
    tracks,
    chapters,
    clipCount: tracks.reduce((total, track) => total + track.clips.length, 0),
    unassignedMarkers,
  };
}

function pickTickStep(duration) {
  const targetStep = duration / DESIRED_TICKS;
  const candidates = [];

  for (let exponent = -2; exponent <= 5; exponent += 1) {
    const base = 10 ** exponent;
    for (const multiplier of [1, 2, 2.5, 5, 10, 15, 20, 30]) {
      candidates.push(base * multiplier);
    }
  }

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate <= 0) {
      continue;
    }
    const tickCount = duration / candidate;
    const densityPenalty = Math.abs(tickCount - DESIRED_TICKS);
    const sizePenalty = Math.abs(candidate - targetStep) / Math.max(targetStep, 0.001);
    const score = densityPenalty * 4 + sizePenalty;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function buildTicks(duration, step) {
  const ticks = [0];
  const epsilon = step / 1000;

  for (let time = step; time < duration - epsilon; time += step) {
    ticks.push(Number(time.toFixed(6)));
  }

  if (ticks[ticks.length - 1] !== duration) {
    ticks.push(duration);
  }

  return ticks;
}

function createLayout(timeline) {
  const trackLabelWidth = clamp(
    Math.max(4, ...timeline.tracks.map((track) => String(track.id).length)),
    4,
    6
  );
  const sideLabelWidth = clamp(
    Math.max(
      0,
      ...timeline.tracks.flatMap((track) => [
        ...track.clips.map((clip) => clip.label.length),
        ...track.markers.map((marker) => marker.label.length),
      ]),
      ...timeline.unassignedMarkers.map((marker) => marker.label.length)
    ),
    0,
    16
  );
  const prefixWidth = trackLabelWidth + 1;
  const maxRightLabelWidth = Math.max(0, MAX_WIDTH - prefixWidth - MIN_CHART_WIDTH - 1);
  const rightLabelWidth = Math.min(sideLabelWidth, maxRightLabelWidth);
  const chartWidth = MAX_WIDTH - prefixWidth - (rightLabelWidth > 0 ? rightLabelWidth + 1 : 0);

  return {
    trackLabelWidth,
    rightLabelWidth,
    chartWidth,
  };
}

function positionForTime(time, duration, chartWidth) {
  if (chartWidth <= 1 || duration <= 0) {
    return 0;
  }
  return clamp(Math.round((time / duration) * (chartWidth - 1)), 0, chartWidth - 1);
}

function placeText(buffer, start, text) {
  for (let index = 0; index < text.length; index += 1) {
    const position = start + index;
    if (position >= 0 && position < buffer.length) {
      buffer[position] = text[index];
    }
  }
}

function composeLine(leftLabel, chart, layout, rightLabel) {
  const left = `${padRight(leftLabel, layout.trackLabelWidth)} `;
  const right =
    layout.rightLabelWidth > 0 ? ` ${padRight(rightLabel || "", layout.rightLabelWidth)}` : "";
  return `${left}${chart.join("")}${right}`;
}

function buildChapterLines(timeline, layout) {
  if (timeline.chapters.length === 0) {
    return [];
  }

  const labels = new Array(layout.chartWidth).fill(" ");
  const boundaries = new Array(layout.chartWidth).fill(" ");

  for (const chapter of timeline.chapters) {
    const start = positionForTime(chapter.start, timeline.duration, layout.chartWidth);
    const end = positionForTime(chapter.end, timeline.duration, layout.chartWidth);
    const spanWidth = Math.max(1, end - start + 1);
    const text = truncateText(chapter.label, spanWidth);
    const centered = clamp(
      start + Math.floor((spanWidth - text.length) / 2),
      start,
      Math.max(start, end - text.length + 1)
    );
    placeText(labels, centered, text);
    boundaries[start] = "┃";
  }

  boundaries[layout.chartWidth - 1] = "┃";

  return [
    composeLine("", labels, layout, ""),
    composeLine("", boundaries, layout, ""),
  ];
}

function buildAxisLines(timeline, layout, ticks) {
  const showTenths = timeline.duration <= 10 || ticks.some((tick, index) => index > 0 && tick % 1 !== 0);
  const labels = new Array(layout.chartWidth).fill(" ");
  const ruler = new Array(layout.chartWidth).fill("─");
  const placements = ticks.map((tick, index) => {
    const position = positionForTime(tick, timeline.duration, layout.chartWidth);
    const label = formatDuration(tick, showTenths);
    let start = position - Math.floor(label.length / 2);

    if (index === 0) {
      start = 0;
    } else if (index === ticks.length - 1) {
      start = layout.chartWidth - label.length;
    }

    start = clamp(start, 0, Math.max(0, layout.chartWidth - label.length));
    return {
      index,
      start,
      end: start + label.length - 1,
      label,
    };
  });

  const selected = [];
  const first = placements[0];
  const last = placements[placements.length - 1];
  selected.push(first);

  for (let index = 1; index < placements.length - 1; index += 1) {
    const candidate = placements[index];
    const previous = selected[selected.length - 1];
    if (candidate.start > previous.end + 1 && candidate.end < last.start - 1) {
      selected.push(candidate);
    }
  }

  if (last.index !== first.index) {
    selected.push(last);
  }

  ticks.forEach((tick, index) => {
    const position = positionForTime(tick, timeline.duration, layout.chartWidth);
    if (index === 0) {
      ruler[position] = "├";
    } else if (index === ticks.length - 1) {
      ruler[position] = "┤";
    } else {
      ruler[position] = "┼";
    }
  });

  selected.forEach((placement) => {
    placeText(labels, placement.start, placement.label);
  });

  return [
    composeLine("", labels, layout, ""),
    composeLine("", ruler, layout, ""),
  ];
}

function drawClip(buffer, clip, timeline, layout) {
  const start = positionForTime(clip.start, timeline.duration, layout.chartWidth);
  const end = Math.max(start, positionForTime(clip.end, timeline.duration, layout.chartWidth));

  for (let index = start; index <= end; index += 1) {
    buffer[index] = "▓";
  }
}

function buildTrackLines(timeline, layout) {
  const lines = [];

  for (const track of timeline.tracks) {
    let leftLabel = track.id;

    if (track.clips.length === 0 && track.markers.length === 0) {
      lines.push(composeLine(leftLabel, new Array(layout.chartWidth).fill(" "), layout, ""));
      continue;
    }

    track.clips.forEach((clip) => {
      const row = new Array(layout.chartWidth).fill(" ");
      drawClip(row, clip, timeline, layout);
      lines.push(composeLine(leftLabel, row, layout, clip.label));
      leftLabel = "";
    });

    track.markers.forEach((marker) => {
      const markerRow = new Array(layout.chartWidth).fill(" ");
      const position = positionForTime(marker.time, timeline.duration, layout.chartWidth);
      markerRow[position] = "▲";
      lines.push(composeLine(leftLabel, markerRow, layout, marker.label));
      leftLabel = "";
    });
  }

  if (timeline.unassignedMarkers.length > 0) {
    let leftLabel = "MARK";
    timeline.unassignedMarkers.forEach((marker) => {
      const markerRow = new Array(layout.chartWidth).fill(" ");
      const position = positionForTime(marker.time, timeline.duration, layout.chartWidth);
      markerRow[position] = "▲";
      lines.push(composeLine(leftLabel, markerRow, layout, marker.label));
      leftLabel = "";
    });
  }

  return lines;
}

function renderGantt(inputTimeline) {
  const timeline = normalizeTimeline(inputTimeline);
  const layout = createLayout(timeline);
  const ticks = buildTicks(timeline.duration, pickTickStep(timeline.duration));
  const lines = [
    buildSummaryLine(
      timeline.title,
      timeline.duration,
      timeline.tracks.length,
      timeline.clipCount,
      timeline.chapters.length
    ),
    ...buildChapterLines(timeline, layout),
    ...buildAxisLines(timeline, layout, ticks),
    ...buildTrackLines(timeline, layout),
  ];

  return lines.join("\n");
}

module.exports = {
  renderGantt,
};
