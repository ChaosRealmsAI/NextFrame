const EPSILON = 1e-6;
const ASCII_WIDTH = 60;
const ASCII_HEIGHT = 16;
const TEXT_PARAM_KEYS = ["text", "title", "subtitle", "headline", "copy"];

export const step_log = [];

const SCENES = {
  auroraGradient: {
    defaults: {
      hueA: 270,
      hueB: 200,
      hueC: 320,
      intensity: 1,
      grain: 0.04,
    },
    schema: {
      hueA: "number",
      hueB: "number",
      hueC: "number",
      intensity: "number",
      grain: "number",
    },
    describe(localT, clip) {
      const progress = clamp(localT / clip.duration, 0, 1);
      const phase = progress < 0.12 ? "fade-in" : progress > 0.88 ? "fade-out" : "drift";

      return {
        phase,
        visible: true,
        elements: [
          {
            type: "background",
            style: "aurora",
            glyphs: [".", "~", "^"],
            label: `aurora ${Math.round(clip.params.hueA)}/${Math.round(clip.params.hueB)}`,
          },
        ],
      };
    },
  },
  kineticHeadline: {
    defaults: {
      text: "NEXTFRAME",
      subtitle: "Frame-pure scene library",
      hueStart: 30,
      hueEnd: 320,
      stagger: 0.18,
      size: 0.12,
    },
    schema: {
      text: "string",
      subtitle: "string",
      hueStart: "number",
      hueEnd: "number",
      stagger: "number",
      size: "number",
    },
    describe(localT, clip) {
      const text = String(clip.params.text ?? "NEXTFRAME").trim() || "NEXTFRAME";
      const words = text.split(/\s+/).filter(Boolean);
      const stagger = clip.params.stagger ?? 0.18;
      const lineReveal = clamp((localT - 0.05) / 0.45, 0, 1);
      const headlineReveal = clamp((localT - 0.25) / (0.75 + Math.max(0, words.length - 1) * stagger), 0, 1);
      const subtitleReveal = clamp(
        (localT - (0.55 + Math.max(0, words.length - 1) * stagger)) / 0.55,
        0,
        1,
      );
      const phase = headlineReveal < 1
        ? "reveal"
        : localT > clip.duration - 0.5
          ? "outro"
          : "hold";

      return {
        phase,
        visible: lineReveal > 0.05 || headlineReveal > 0.05 || subtitleReveal > 0.05,
        elements: [
          {
            type: "line",
            row: 4,
            from: 18,
            to: 42,
            reveal: lineReveal,
          },
          {
            type: "text",
            role: "headline",
            row: 7,
            col: 30,
            align: "center",
            text,
            reveal: headlineReveal,
          },
          {
            type: "text",
            role: "subtitle",
            row: 10,
            col: 30,
            align: "center",
            text: String(clip.params.subtitle ?? ""),
            reveal: subtitleReveal,
          },
        ],
      };
    },
  },
  lowerThirdVelvet: {
    defaults: {
      title: "NEXTFRAME",
      subtitle: "Scene Registry Demo",
      hueA: 20,
      hueB: 320,
      holdEnd: 4,
      fadeOut: 0.6,
    },
    schema: {
      title: "string",
      subtitle: "string",
      hueA: "number",
      hueB: "number",
      holdEnd: "number",
      fadeOut: "number",
    },
    describe(localT, clip) {
      const fadeStart = Math.max(0, (clip.params.holdEnd ?? 4) - 0.3);
      const reveal = clamp(localT / 0.55, 0, 1);
      const fade = 1 - clamp((localT - fadeStart) / Math.max(0.1, clip.params.fadeOut ?? 0.6), 0, 1);
      const alpha = reveal * fade;
      const phase = alpha <= 0.05 ? "hidden" : fade < 1 ? "fade-out" : "hold";

      return {
        phase,
        visible: alpha > 0.05,
        elements: [
          {
            type: "bar",
            row: 12,
            from: 3,
            to: 46,
            glyph: "=",
            reveal: alpha,
          },
          {
            type: "text",
            role: "title",
            row: 12,
            col: 7,
            align: "left",
            text: String(clip.params.title ?? ""),
            reveal: alpha,
          },
          {
            type: "text",
            role: "subtitle",
            row: 13,
            col: 7,
            align: "left",
            text: String(clip.params.subtitle ?? ""),
            reveal: alpha,
          },
        ],
      };
    },
  },
};

export function reset_step_log() {
  step_log.length = 0;
}

export function record_step(kind, detail = {}) {
  const entry = {
    index: step_log.length + 1,
    kind: String(kind).toUpperCase(),
    at: new Date().toISOString(),
    detail: clone(detail),
  };
  step_log.push(entry);
  return entry;
}

export function find_clips(timeline, predicate = {}) {
  const clipIds = listClips(timeline)
    .filter((clip) => clipMatchesPredicate(clip, predicate))
    .map((clip) => clip.id);

  record_step("SEARCH", {
    tool: "find_clips",
    predicate,
    result: clipIds,
  });

  return clipIds;
}

export function get_clip(timeline, clipId) {
  const clip = listClips(timeline).find((item) => item.id === clipId) ?? null;

  record_step("SEARCH", {
    tool: "get_clip",
    clipId,
    found: Boolean(clip),
  });

  return clip ? clone(clip) : null;
}

export function describe_frame(timeline, t) {
  const resolvedT = resolveTimelineTime(timeline, t);
  const activeClips = getActiveClips(timeline, resolvedT).map((clip) => describeClip(clip, resolvedT));
  const chapter = getActiveChapter(timeline, resolvedT);
  const frame = {
    t: round3(resolvedT),
    chapter: chapter ? clone(chapter) : null,
    active_clips: activeClips,
  };

  record_step("SEARCH", {
    tool: "describe_frame",
    t: resolvedT,
    activeClipIds: activeClips.map((clip) => clip.id),
    chapter: chapter?.id ?? null,
  });

  return frame;
}

export function apply_patch(timeline, patch) {
  const patches = Array.isArray(patch) ? patch : [patch];
  const workingTimeline = clone(timeline);
  const errors = [];

  for (const currentPatch of patches) {
    const patchErrors = applySinglePatch(workingTimeline, currentPatch);
    errors.push(...patchErrors);
    if (patchErrors.length > 0) {
      break;
    }
  }

  if (errors.length === 0) {
    errors.push(...validateTimeline(workingTimeline));
  }

  const ok = errors.length === 0;
  const result = {
    ok,
    newTimeline: ok ? workingTimeline : clone(timeline),
    errors,
  };

  record_step("PATCH", {
    tool: "apply_patch",
    patch: patches,
    ok,
    errors,
  });

  return result;
}

export function assert_at(timeline, t, predicate) {
  const frame = describe_frame(timeline, t);
  const clipsById = Object.fromEntries(
    frame.active_clips.map((clip) => [
      clip.id,
      {
        ...clip,
        text: collectClipText(clip.params),
      },
    ]),
  );

  let pass = false;
  let message = "";

  try {
    if (typeof predicate === "function") {
      pass = Boolean(predicate({ frame, clipsById, chapter: frame.chapter, t: frame.t }));
    } else if (typeof predicate === "string") {
      const compiled = compilePredicate(predicate, Object.keys(clipsById));
      pass = Boolean(compiled(frame, clipsById, frame.chapter, frame.t));
    } else {
      throw new Error("Predicate must be a function or string");
    }

    message = pass
      ? `Assertion passed at t=${round3(frame.t)}`
      : `Assertion failed at t=${round3(frame.t)}`;
  } catch (error) {
    pass = false;
    message = `Assertion error at t=${round3(frame.t)}: ${error.message}`;
  }

  record_step("ASSERT", {
    tool: "assert_at",
    t: frame.t,
    predicate: typeof predicate === "function" ? "function predicate" : predicate,
    pass,
    message,
  });

  return { pass, message };
}

export function render_ascii(timeline, t) {
  const frame = describe_frame(timeline, t);
  const grid = createGrid(ASCII_WIDTH, ASCII_HEIGHT, " ");

  for (const clip of frame.active_clips) {
    drawClip(grid, clip);
  }

  const header = `FRAME t=${formatTime(frame.t)} chapter=${frame.chapter?.id ?? "none"}`;
  const border = `+${"-".repeat(ASCII_WIDTH)}+`;
  const body = grid.map((row) => `|${row.join("")}|`).join("\n");
  const output = [header, border, body, border].join("\n");

  record_step("RENDER", {
    tool: "render_ascii",
    t: frame.t,
    activeClipIds: frame.active_clips.map((clip) => clip.id),
  });

  return output;
}

export function ascii_gantt(timeline) {
  const duration = getTimelineDuration(timeline);
  const width = 60;
  const tracks = getTrackList(timeline);
  const legendMap = new Map();
  const rows = [];

  for (const track of tracks) {
    const row = new Array(width).fill(".");
    const clips = listClips(timeline)
      .filter((clip) => clip.track === track)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

    for (const clip of clips) {
      const symbol = pickClipSymbol(clip, legendMap);
      const startIndex = timeToColumn(clip.start, duration, width);
      const endIndex = Math.max(startIndex + 1, timeToColumn(clip.start + clip.duration, duration, width));
      for (let i = startIndex; i < endIndex && i < width; i += 1) {
        row[i] = symbol;
      }
    }

    rows.push(`${track.padEnd(5)}|${row.join("")}|`);
  }

  const markerRow = new Array(width).fill(" ");
  for (const marker of listMarkers(timeline)) {
    markerRow[Math.min(width - 1, timeToColumn(marker.t, duration, width))] = "^";
  }

  const scale = buildScale(duration, width);
  const legendLines = [...legendMap.entries()].map(
    ([symbol, label]) => `${symbol}=${label}`,
  );
  const chapterLines = listChapters(timeline).map(
    (chapter) => `${chapter.id} ${formatTime(chapter.start)}-${formatTime(chapter.end)}`,
  );

  const output = [
    `GANTT duration=${formatTime(duration)}`,
    `time  |${scale}|`,
    ...rows,
    `marks |${markerRow.join("")}|`,
    `chapters ${chapterLines.length > 0 ? chapterLines.join(", ") : "none"}`,
    `legend ${legendLines.length > 0 ? legendLines.join(", ") : "none"}`,
  ].join("\n");

  record_step("RENDER", {
    tool: "ascii_gantt",
    tracks,
    duration,
  });

  return output;
}

function applySinglePatch(timeline, patch) {
  const errors = validatePatchEnvelope(patch);
  if (errors.length > 0) {
    return errors;
  }

  switch (patch.op) {
    case "addClip":
      return patchAddClip(timeline, patch);
    case "removeClip":
      return patchRemoveClip(timeline, patch);
    case "moveClip":
      return patchMoveClip(timeline, patch);
    case "setDur":
      return patchSetDur(timeline, patch);
    case "setParam":
      return patchSetParam(timeline, patch);
    case "addMarker":
      return patchAddMarker(timeline, patch);
    case "addChapter":
      return patchAddChapter(timeline, patch);
    default:
      return [`Unsupported patch op: ${patch.op}`];
  }
}

function patchAddClip(timeline, patch) {
  const tracks = getTrackList(timeline);
  const clip = clone(patch.clip ?? {});
  const errors = [];

  if (!tracks.includes(patch.track)) {
    errors.push(`Unknown track: ${patch.track}`);
  }
  if (!clip.id || typeof clip.id !== "string") {
    errors.push("addClip requires clip.id");
  }
  if (getClipById(timeline, clip.id)) {
    errors.push(`Clip id already exists: ${clip.id}`);
  }
  if (!clip.sceneId || !SCENES[clip.sceneId]) {
    errors.push(`Unknown sceneId: ${clip.sceneId ?? "(missing)"}`);
  }

  if (errors.length > 0) {
    return errors;
  }

  const start = resolveTimelineTime(timeline, clip.start ?? 0);
  const duration = resolveDurationSpec(timeline, start, clip.duration ?? clip.dur);
  const params = mergeSceneParams(clip.sceneId, clip.params ?? {});
  const clipErrors = validateParams(clip.sceneId, params);

  if (!Number.isFinite(start)) {
    clipErrors.push(`Invalid clip start for ${clip.id}`);
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    clipErrors.push(`Invalid clip duration for ${clip.id}`);
  }

  if (clipErrors.length > 0) {
    return clipErrors;
  }

  timeline.clips = listClips(timeline);
  timeline.clips.push({
    id: clip.id,
    sceneId: clip.sceneId,
    track: patch.track,
    start,
    duration,
    params,
  });

  return [];
}

function patchRemoveClip(timeline, patch) {
  const index = listClips(timeline).findIndex((clip) => clip.id === patch.clipId);
  if (index < 0) {
    return [`Clip not found: ${patch.clipId}`];
  }

  timeline.clips.splice(index, 1);
  return [];
}

function patchMoveClip(timeline, patch) {
  const clip = getClipById(timeline, patch.clipId);
  if (!clip) {
    return [`Clip not found: ${patch.clipId}`];
  }

  const start = resolveTimelineTime(timeline, patch.start);
  if (!Number.isFinite(start)) {
    return [`Invalid move start for ${patch.clipId}`];
  }

  clip.start = start;
  return [];
}

function patchSetDur(timeline, patch) {
  const clip = getClipById(timeline, patch.clipId);
  if (!clip) {
    return [`Clip not found: ${patch.clipId}`];
  }

  const duration = resolveDurationSpec(timeline, clip.start, patch.dur);
  if (!Number.isFinite(duration) || duration <= 0) {
    return [`Invalid duration for ${patch.clipId}`];
  }

  clip.duration = duration;
  return [];
}

function patchSetParam(timeline, patch) {
  const clip = getClipById(timeline, patch.clipId);
  if (!clip) {
    return [`Clip not found: ${patch.clipId}`];
  }
  if (typeof patch.key !== "string" || patch.key.length === 0) {
    return ["setParam requires key"];
  }

  const scene = SCENES[clip.sceneId];
  if (!scene.schema[patch.key]) {
    return [`Unknown param ${patch.key} for scene ${clip.sceneId}`];
  }

  const params = { ...(clip.params ?? {}), [patch.key]: patch.value };
  const merged = mergeSceneParams(clip.sceneId, params);
  const errors = validateParams(clip.sceneId, merged);
  if (errors.length > 0) {
    return errors;
  }

  clip.params = merged;
  return [];
}

function patchAddMarker(timeline, patch) {
  if (!patch.id || typeof patch.id !== "string") {
    return ["addMarker requires id"];
  }
  if (listMarkers(timeline).some((marker) => marker.id === patch.id)) {
    return [`Marker id already exists: ${patch.id}`];
  }

  const t = resolveTimelineTime(timeline, patch.t);
  if (!Number.isFinite(t)) {
    return [`Invalid marker time for ${patch.id}`];
  }

  timeline.markers = listMarkers(timeline);
  timeline.markers.push({ id: patch.id, t });
  return [];
}

function patchAddChapter(timeline, patch) {
  if (!patch.id || typeof patch.id !== "string") {
    return ["addChapter requires id"];
  }
  if (listChapters(timeline).some((chapter) => chapter.id === patch.id)) {
    return [`Chapter id already exists: ${patch.id}`];
  }

  const start = resolveTimelineTime(timeline, patch.start);
  const end = resolveTimelineTime(timeline, patch.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [`Invalid chapter range for ${patch.id}`];
  }

  timeline.chapters = listChapters(timeline);
  timeline.chapters.push({ id: patch.id, start, end });
  return [];
}

function validateTimeline(timeline) {
  const errors = [];
  const duration = getTimelineDuration(timeline);
  const tracks = getTrackList(timeline);

  if (!Number.isFinite(duration) || duration <= 0) {
    errors.push("Timeline duration must be a positive number");
  }

  const clipIds = new Set();
  for (const clip of listClips(timeline)) {
    if (!clip.id || typeof clip.id !== "string") {
      errors.push("Every clip needs a string id");
    } else if (clipIds.has(clip.id)) {
      errors.push(`Duplicate clip id: ${clip.id}`);
    } else {
      clipIds.add(clip.id);
    }

    if (!tracks.includes(clip.track)) {
      errors.push(`Clip ${clip.id} uses unknown track ${clip.track}`);
    }
    if (!SCENES[clip.sceneId]) {
      errors.push(`Clip ${clip.id} uses unknown scene ${clip.sceneId}`);
    }
    if (!Number.isFinite(clip.start) || clip.start < 0) {
      errors.push(`Clip ${clip.id} has invalid start`);
    }
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
      errors.push(`Clip ${clip.id} has invalid duration`);
    }
    if (clip.start + clip.duration > duration + EPSILON) {
      errors.push(`Clip ${clip.id} extends past timeline duration`);
    }
    errors.push(...validateParams(clip.sceneId, mergeSceneParams(clip.sceneId, clip.params ?? {})));
  }

  for (const track of tracks) {
    const clips = listClips(timeline)
      .filter((clip) => clip.track === track)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    for (let i = 1; i < clips.length; i += 1) {
      const prev = clips[i - 1];
      const current = clips[i];
      if (current.start < prev.start + prev.duration - EPSILON) {
        errors.push(`Track overlap on ${track}: ${prev.id} overlaps ${current.id}`);
      }
    }
  }

  const markerIds = new Set();
  for (const marker of listMarkers(timeline)) {
    if (!marker.id || typeof marker.id !== "string") {
      errors.push("Every marker needs a string id");
    } else if (markerIds.has(marker.id)) {
      errors.push(`Duplicate marker id: ${marker.id}`);
    } else {
      markerIds.add(marker.id);
    }
    if (!Number.isFinite(marker.t) || marker.t < 0 || marker.t > duration + EPSILON) {
      errors.push(`Marker ${marker.id} is outside the timeline`);
    }
  }

  const chapterIds = new Set();
  for (const chapter of listChapters(timeline)) {
    if (!chapter.id || typeof chapter.id !== "string") {
      errors.push("Every chapter needs a string id");
    } else if (chapterIds.has(chapter.id)) {
      errors.push(`Duplicate chapter id: ${chapter.id}`);
    } else {
      chapterIds.add(chapter.id);
    }
    if (!Number.isFinite(chapter.start) || !Number.isFinite(chapter.end) || chapter.end <= chapter.start) {
      errors.push(`Chapter ${chapter.id} has an invalid range`);
    }
    if (chapter.start < 0 || chapter.end > duration + EPSILON) {
      errors.push(`Chapter ${chapter.id} is outside the timeline`);
    }
  }

  return [...new Set(errors)];
}

function validatePatchEnvelope(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return ["Patch must be an object"];
  }
  if (typeof patch.op !== "string" || patch.op.length === 0) {
    return ["Patch requires op"];
  }
  return [];
}

function validateParams(sceneId, params) {
  const scene = SCENES[sceneId];
  if (!scene) {
    return [`Unknown sceneId: ${sceneId}`];
  }

  const errors = [];
  for (const [key, value] of Object.entries(params ?? {})) {
    const expectedType = scene.schema[key];
    if (!expectedType) {
      errors.push(`Unknown param ${key} for scene ${sceneId}`);
      continue;
    }

    if (expectedType === "number" && !Number.isFinite(value)) {
      errors.push(`Param ${sceneId}.${key} must be a finite number`);
    }
    if (expectedType === "string" && typeof value !== "string") {
      errors.push(`Param ${sceneId}.${key} must be a string`);
    }
  }
  return errors;
}

function clipMatchesPredicate(clip, predicate) {
  for (const [key, value] of Object.entries(predicate ?? {})) {
    if (key === "textContent") {
      const haystack = collectClipText(clip.params).toLowerCase();
      if (!haystack.includes(String(value).toLowerCase())) {
        return false;
      }
      continue;
    }

    if (clip[key] === value) {
      continue;
    }

    if (clip.params?.[key] === value) {
      continue;
    }

    return false;
  }
  return true;
}

function describeClip(clip, globalT) {
  const scene = SCENES[clip.sceneId];
  const localT = globalT - clip.start;
  const params = mergeSceneParams(clip.sceneId, clip.params ?? {});
  const description = scene.describe(localT, { ...clip, params }, globalT);

  return {
    id: clip.id,
    scene: clip.sceneId,
    track: clip.track,
    start: round3(clip.start),
    end: round3(clip.start + clip.duration),
    localT: round3(localT),
    phase: description.phase ?? "active",
    visible: description.visible !== false,
    params,
    elements: clone(description.elements ?? []),
  };
}

function drawClip(grid, clip) {
  for (const element of clip.elements) {
    switch (element.type) {
      case "background":
        drawBackground(grid, element);
        break;
      case "line":
        drawLine(grid, element);
        break;
      case "text":
        drawText(grid, element);
        break;
      case "bar":
        drawBar(grid, element);
        break;
      default:
        break;
    }
  }
}

function drawBackground(grid, element) {
  const glyphs = element.glyphs ?? [".", "~", "^"];
  for (let row = 0; row < grid.length; row += 1) {
    const glyph = glyphs[Math.min(glyphs.length - 1, Math.floor((row / grid.length) * glyphs.length))];
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] === " ") {
        grid[row][col] = glyph;
      }
    }
  }
}

function drawLine(grid, element) {
  const row = clampInt(element.row, 0, grid.length - 1);
  const reveal = clamp(element.reveal ?? 1, 0, 1);
  const length = Math.max(0, Math.round((element.to - element.from + 1) * reveal));
  for (let col = element.from; col < element.from + length && col < grid[row].length; col += 1) {
    if (col >= 0) {
      grid[row][col] = "-";
    }
  }
}

function drawText(grid, element) {
  const row = clampInt(element.row, 0, grid.length - 1);
  const reveal = clamp(element.reveal ?? 1, 0, 1);
  const raw = String(element.text ?? "");
  const visibleLength = Math.max(0, Math.round(raw.length * reveal));
  const text = raw.slice(0, visibleLength);
  if (!text) {
    return;
  }

  let startCol = element.col ?? 0;
  if (element.align === "center") {
    startCol = Math.round((element.col ?? 0) - text.length / 2);
  }
  startCol = clampInt(startCol, 0, grid[row].length - 1);

  for (let i = 0; i < text.length && startCol + i < grid[row].length; i += 1) {
    grid[row][startCol + i] = text[i];
  }
}

function drawBar(grid, element) {
  const row = clampInt(element.row, 0, grid.length - 1);
  const reveal = clamp(element.reveal ?? 1, 0, 1);
  const width = Math.max(0, Math.round((element.to - element.from + 1) * reveal));
  for (let col = element.from; col < element.from + width && col < grid[row].length; col += 1) {
    if (col >= 0) {
      grid[row][col] = element.glyph ?? "=";
      if (row + 1 < grid.length && col < element.from + width * 0.7) {
        grid[row + 1][col] = element.glyph ?? "=";
      }
    }
  }
}

function compilePredicate(predicate, clipIds) {
  let expression = String(predicate);

  for (const clipId of [...clipIds].sort((a, b) => b.length - a.length)) {
    const escaped = escapeRegExp(clipId);
    expression = expression.replace(
      new RegExp(`\\b${escaped}\\b`, "g"),
      `clipsById[${JSON.stringify(clipId)}]`,
    );
  }

  return new Function(
    "frame",
    "clipsById",
    "chapter",
    "t",
    `return (${expression});`,
  );
}

function resolveTimelineTime(timeline, spec) {
  if (typeof spec === "number") {
    return spec;
  }

  if (typeof spec === "string") {
    const trimmed = spec.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    const clipMatch = trimmed.match(/^([A-Za-z0-9_-]+)\.(start|end)([+-]\d+(?:\.\d+)?)?$/);
    if (clipMatch) {
      const [, clipId, edge, offsetText] = clipMatch;
      const clip = getClipById(timeline, clipId);
      if (!clip) {
        return Number.NaN;
      }
      const base = edge === "end" ? clip.start + clip.duration : clip.start;
      return base + Number(offsetText ?? 0);
    }

    const markerMatch = trimmed.match(/^marker:([A-Za-z0-9_-]+)([+-]\d+(?:\.\d+)?)?$/);
    if (markerMatch) {
      const [, markerId, offsetText] = markerMatch;
      const marker = listMarkers(timeline).find((item) => item.id === markerId);
      return marker ? marker.t + Number(offsetText ?? 0) : Number.NaN;
    }

    const chapterMatch = trimmed.match(/^chapter:([A-Za-z0-9_-]+)\.(start|end)([+-]\d+(?:\.\d+)?)?$/);
    if (chapterMatch) {
      const [, chapterId, edge, offsetText] = chapterMatch;
      const chapter = listChapters(timeline).find((item) => item.id === chapterId);
      if (!chapter) {
        return Number.NaN;
      }
      return (edge === "end" ? chapter.end : chapter.start) + Number(offsetText ?? 0);
    }
  }

  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return Number.NaN;
  }

  if (typeof spec.after === "string") {
    const clip = getClipById(timeline, spec.after);
    return clip ? clip.start + clip.duration + Number(spec.gap ?? 0) : Number.NaN;
  }

  if (typeof spec.before === "string") {
    const clip = getClipById(timeline, spec.before);
    return clip ? clip.start - Number(spec.gap ?? 0) : Number.NaN;
  }

  if (typeof spec.at === "string") {
    const clip = getClipById(timeline, spec.at);
    if (!clip) {
      return Number.NaN;
    }
    const edge = spec.edge === "end" ? "end" : "start";
    const base = edge === "end" ? clip.start + clip.duration : clip.start;
    return base + Number(spec.offset ?? 0);
  }

  if (typeof spec.marker === "string") {
    const marker = listMarkers(timeline).find((item) => item.id === spec.marker);
    return marker ? marker.t + Number(spec.offset ?? 0) : Number.NaN;
  }

  if (typeof spec.chapter === "string") {
    const chapter = listChapters(timeline).find((item) => item.id === spec.chapter);
    if (!chapter) {
      return Number.NaN;
    }
    const edge = spec.edge === "end" ? "end" : "start";
    return (edge === "end" ? chapter.end : chapter.start) + Number(spec.offset ?? 0);
  }

  return Number.NaN;
}

function resolveDurationSpec(timeline, clipStart, spec) {
  if (typeof spec === "number") {
    return spec;
  }
  if (typeof spec === "string") {
    const absoluteEnd = resolveTimelineTime(timeline, spec);
    return Number.isFinite(absoluteEnd) ? absoluteEnd - clipStart : Number.NaN;
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return Number.NaN;
  }
  if (typeof spec.seconds === "number") {
    return spec.seconds;
  }
  if (typeof spec.until === "string") {
    const clip = getClipById(timeline, spec.until);
    if (!clip) {
      return Number.NaN;
    }
    const edge = spec.edge === "end" ? clip.start + clip.duration : clip.start;
    return edge + Number(spec.gap ?? 0) - clipStart;
  }
  if (typeof spec.marker === "string") {
    const absoluteEnd = resolveTimelineTime(timeline, { marker: spec.marker, offset: spec.offset ?? 0 });
    return absoluteEnd - clipStart;
  }
  if (typeof spec.chapter === "string") {
    const absoluteEnd = resolveTimelineTime(timeline, {
      chapter: spec.chapter,
      edge: spec.edge ?? "end",
      offset: spec.offset ?? 0,
    });
    return absoluteEnd - clipStart;
  }
  return Number.NaN;
}

function getActiveClips(timeline, t) {
  const trackOrder = getTrackList(timeline);
  return listClips(timeline)
    .filter((clip) => t >= clip.start - EPSILON && t < clip.start + clip.duration - EPSILON)
    .sort((a, b) => {
      const trackDelta = trackOrder.indexOf(a.track) - trackOrder.indexOf(b.track);
      if (trackDelta !== 0) {
        return trackDelta;
      }
      return a.start - b.start || a.id.localeCompare(b.id);
    });
}

function getActiveChapter(timeline, t) {
  return listChapters(timeline).find(
    (chapter) => t >= chapter.start - EPSILON && t < chapter.end - EPSILON,
  ) ?? null;
}

function listClips(timeline) {
  return Array.isArray(timeline?.clips) ? timeline.clips : [];
}

function listMarkers(timeline) {
  return Array.isArray(timeline?.markers) ? timeline.markers : [];
}

function listChapters(timeline) {
  return Array.isArray(timeline?.chapters) ? timeline.chapters : [];
}

function getTrackList(timeline) {
  if (Array.isArray(timeline?.tracks) && timeline.tracks.length > 0) {
    return [...timeline.tracks];
  }

  return [...new Set(listClips(timeline).map((clip) => clip.track).filter(Boolean))];
}

function getTimelineDuration(timeline) {
  return Number.isFinite(timeline?.duration)
    ? timeline.duration
    : Math.max(
        0,
        ...listClips(timeline).map((clip) => clip.start + clip.duration),
        ...listChapters(timeline).map((chapter) => chapter.end),
        ...listMarkers(timeline).map((marker) => marker.t),
      );
}

function getClipById(timeline, clipId) {
  return listClips(timeline).find((clip) => clip.id === clipId) ?? null;
}

function mergeSceneParams(sceneId, params) {
  const scene = SCENES[sceneId];
  return scene ? { ...scene.defaults, ...(params ?? {}) } : { ...(params ?? {}) };
}

function collectClipText(params) {
  return TEXT_PARAM_KEYS
    .map((key) => params?.[key])
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function pickClipSymbol(clip, legendMap) {
  for (const ch of clip.sceneId.toUpperCase()) {
    if (/[A-Z]/.test(ch) && !legendMap.has(ch)) {
      legendMap.set(ch, `${clip.id}:${clip.sceneId}`);
      return ch;
    }
  }

  for (let code = 65; code <= 90; code += 1) {
    const ch = String.fromCharCode(code);
    if (!legendMap.has(ch)) {
      legendMap.set(ch, `${clip.id}:${clip.sceneId}`);
      return ch;
    }
  }

  return "?";
}

function buildScale(duration, width) {
  const cells = new Array(width).fill("-");
  for (let second = 0; second <= Math.floor(duration); second += 1) {
    const col = Math.min(width - 1, timeToColumn(second, duration, width));
    const label = String(second);
    for (let i = 0; i < label.length && col + i < width; i += 1) {
      cells[col + i] = label[i];
    }
  }
  const endLabel = String(Math.round(duration));
  const start = Math.max(0, width - endLabel.length);
  for (let i = 0; i < endLabel.length; i += 1) {
    cells[start + i] = endLabel[i];
  }
  return cells.join("");
}

function timeToColumn(t, duration, width) {
  if (duration <= 0) {
    return 0;
  }
  return clampInt(Math.floor((clamp(t, 0, duration) / duration) * (width - 1)), 0, width - 1);
}

function createGrid(width, height, fill) {
  return Array.from({ length: height }, () => new Array(width).fill(fill));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round3(value) {
  return Number(value.toFixed(3));
}

function formatTime(value) {
  return round3(value).toFixed(2);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
