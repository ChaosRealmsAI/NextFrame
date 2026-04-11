import { SCENE_MANIFEST_BY_ID } from "../scenes/index.js";

const MOUNT_KEY = Symbol("nextframe.timelineStats.mount");
const EMPTY_TIMELINE = {
  duration: 0,
  tracks: [],
};
const CATEGORY_PRIORITY = new Map([
  ["Backgrounds", 0],
  ["Typography", 1],
  ["Overlays", 2],
  ["Shapes & Layout", 3],
  ["Data Viz", 4],
  ["Media", 5],
  ["Audio", 6],
]);
const CATEGORY_LABELS = new Map([
  ["Backgrounds", "bg"],
  ["Typography", "typography"],
  ["Overlays", "overlays"],
  ["Shapes & Layout", "layout"],
  ["Data Viz", "data viz"],
  ["Media", "media"],
  ["Audio", "audio"],
]);

export function mountStatsBar(container, store) {
  if (!isElementLike(container)) {
    throw new TypeError("mountStatsBar(container, store) requires a container element");
  }

  if (!store || typeof store.subscribe !== "function" || typeof store.state !== "object") {
    throw new TypeError("mountStatsBar(container, store) requires a compatible store");
  }

  const doc = resolveDocument(container);
  container[MOUNT_KEY]?.destroy();
  ensureClassName(container, "timeline-stats");

  let lastTimelineRef = store.state.timeline;
  let lastDirty = Boolean(store.state.dirty);

  const render = (state) => {
    const dirty = Boolean(state?.dirty);
    const stats = collectStats(state?.timeline);
    const summaryParts = [
      `${stats.clipCount} ${stats.clipCount === 1 ? "clip" : "clips"}`,
      formatDuration(stats.duration),
      ...stats.categories.map(({ count, label }) => `${count} ${label}`),
    ];
    const parts = [
      ...summaryParts.map((text, index) => `${text}${index < summaryParts.length - 1 ? " ·" : ""}`),
      `• ${dirty ? "dirty" : "saved"}`,
    ];
    const children = parts.map((text, index) => {
      const item = doc.createElement("span");
      item.className = "timeline-stats-item";
      item.textContent = text;

      if (index === parts.length - 1) {
        item.className = "timeline-stats-item timeline-stats-status";
        item.dataset.dirty = dirty ? "true" : "false";
      }

      return item;
    });

    container.dataset.dirty = dirty ? "true" : "false";
    replaceContainerChildren(container, ...children);
  };

  const unsubscribe = store.subscribe((state, previousState) => {
    const nextDirty = Boolean(state?.dirty);

    if (state?.timeline === lastTimelineRef && nextDirty === lastDirty) {
      return;
    }

    lastTimelineRef = state?.timeline;
    lastDirty = nextDirty;
    render(state, previousState);
  });

  render(store.state);

  const destroy = () => {
    unsubscribe();
    if (container[MOUNT_KEY]?.destroy === destroy) {
      delete container[MOUNT_KEY];
    }
    replaceContainerChildren(container);
  };

  container[MOUNT_KEY] = { destroy };
  return { destroy };
}

function collectStats(timeline) {
  const currentTimeline = timeline && typeof timeline === "object" ? timeline : EMPTY_TIMELINE;
  const tracks = Array.isArray(currentTimeline.tracks) ? currentTimeline.tracks : [];
  const categoryCounts = new Map();
  let clipCount = 0;
  let maxEnd = 0;

  tracks.forEach((track) => {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    clipCount += clips.length;

    clips.forEach((clip) => {
      const start = Number(clip?.start) || 0;
      const duration = Number(clip?.duration ?? clip?.dur) || 0;
      const category = readCategory(clip);

      maxEnd = Math.max(maxEnd, start + duration);

      if (!category) {
        return;
      }

      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });
  });

  return {
    clipCount,
    duration: Math.max(Number(currentTimeline.duration) || 0, maxEnd),
    categories: [...categoryCounts.entries()]
      .sort(compareCategoryCounts)
      .map(([category, count]) => ({
        count,
        label: CATEGORY_LABELS.get(category) || category.trim().toLowerCase(),
      })),
  };
}

function readCategory(clip) {
  if (typeof clip?.category === "string" && clip.category.trim().length > 0) {
    return clip.category.trim();
  }

  if (typeof clip?.scene === "string" && SCENE_MANIFEST_BY_ID.has(clip.scene)) {
    return SCENE_MANIFEST_BY_ID.get(clip.scene)?.category || "";
  }

  return "";
}

function compareCategoryCounts([left], [right]) {
  const leftPriority = CATEGORY_PRIORITY.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = CATEGORY_PRIORITY.get(right) ?? Number.MAX_SAFE_INTEGER;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.localeCompare(right);
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ensureClassName(element, className) {
  if (typeof element.classList?.add === "function") {
    element.classList.add(className);
    return;
  }

  const classes = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
  classes.add(className);
  element.className = [...classes].join(" ");
}

function resolveDocument(container) {
  const doc = container?.ownerDocument ?? globalThis.document;
  if (!doc || typeof doc.createElement !== "function") {
    throw new TypeError("mountStatsBar(container, store) requires a document");
  }

  return doc;
}

function isElementLike(value) {
  return Boolean(value) && typeof value.replaceChildren === "function";
}

function replaceContainerChildren(container, ...children) {
  container.replaceChildren(...children);
}
