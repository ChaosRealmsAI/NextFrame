import { getDragDropContext } from "../dnd/index.js";
import { readDragPayload } from "../dnd/source.js";
import { registerDropTarget } from "../dnd/target.js";
import { createProjectAssetIndex, normalizeAudioUrl } from "../audio/buffer.js";
import { setTrackFlagCommand } from "../commands.js";
import { createClip } from "./clip.js";
import { hasTrackOverlap } from "./clip-range.js";
import { getTickStep } from "./ruler.js";

const TRACK_HEADER_WIDTH = 120;
const DROP_REJECT_FLASH_MS = 140;
const CLIP_FLASH_MS = 140;

let pendingFlashClipId = null;
let clipIdSeed = 0;
let isGlobalDropGhostCleanupBound = false;

function newId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  clipIdSeed += 1;
  return `clip-${Date.now()}-${clipIdSeed}`;
}

function cloneValue(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function parseSceneDuration(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return 5;
}

function resolveAssetDuration(asset) {
  const parsed = Number(asset?.duration);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function snapTime(time) {
  return Math.floor(Math.max(0, Number(time) || 0) * 10) / 10;
}

function flashRejectedDrop(el) {
  el.classList.remove("drop-reject");
  void el.offsetWidth;
  el.classList.add("drop-reject");
  window.setTimeout(() => {
    el.classList.remove("drop-reject");
  }, DROP_REJECT_FLASH_MS);
}

function resolveTrackAccepts(kind) {
  return kind === "audio" ? ["audio"] : ["scene", "media"];
}

function hideGhostElement(ghost) {
  ghost.hidden = true;
  ghost.classList.remove("is-invalid");
  ghost.textContent = "";
}

function bindGlobalDropGhostCleanup() {
  if (isGlobalDropGhostCleanupBound) {
    return;
  }

  document.addEventListener("nextframe:dndend", () => {
    document.querySelectorAll(".timeline-drop-ghost").forEach((ghost) => {
      if (ghost instanceof HTMLElement) {
        hideGhostElement(ghost);
      }
    });
  });
  isGlobalDropGhostCleanupBound = true;
}

function resolveDropPreview(payload, context) {
  if (payload?.type === "scene") {
    const scene = context.scenesById.get(payload.id);
    if (!scene) {
      return null;
    }

    return {
      dur: parseSceneDuration(scene.duration_hint),
      label: scene.name || scene.id,
      buildClip(start) {
        return {
          id: newId(),
          start,
          dur: parseSceneDuration(scene.duration_hint),
          scene: scene.id,
          params: cloneValue(scene.default_params || {}),
        };
      },
    };
  }

  if (payload?.type === "media" || payload?.type === "audio") {
    const asset = Array.isArray(context.store?.state?.assets)
      ? context.store.state.assets.find((candidate) => candidate?.id === payload.assetId)
      : null;
    if (!asset) {
      return null;
    }

    const label = asset.name || asset.label || asset.id || "Imported asset";
    const category = payload.type === "audio" ? "Audio" : "Media";
    const kind = payload.type === "audio" ? "audio" : asset.kind;

    return {
      dur: resolveAssetDuration(asset),
      label,
      buildClip(start) {
        return {
          id: newId(),
          start,
          dur: resolveAssetDuration(asset),
          assetId: asset.id,
          assetKind: kind,
          category,
          name: label,
          params: {},
        };
      },
    };
  }

  return null;
}

function createSvgIcon(paths) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.classList.add("timeline-track-icon");

  paths.forEach((attributes) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    Object.entries(attributes).forEach(([name, value]) => path.setAttribute(name, value));
    icon.appendChild(path);
  });

  return icon;
}

function createMuteIcon(active) {
  return createSvgIcon(
    active
      ? [
          { d: "M3 6H5.5L9 3.5V12.5L5.5 10H3Z", fill: "currentColor", stroke: "currentColor", "stroke-width": "1.1", "stroke-linejoin": "round" },
          { d: "M11 5L14 11", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" },
          { d: "M14 5L11 11", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" },
        ]
      : [
          { d: "M3 6H5.5L9 3.5V12.5L5.5 10H3Z", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linejoin": "round" },
          { d: "M11 6C11.6 6.5 12 7.2 12 8C12 8.8 11.6 9.5 11 10", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" },
          { d: "M12.6 4.5C13.6 5.5 14.2 6.7 14.2 8C14.2 9.3 13.6 10.5 12.6 11.5", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" },
        ],
  );
}

function createLockIcon(active) {
  return createSvgIcon(
    active
      ? [
          { d: "M5.2 7V5.6C5.2 4 6.5 2.8 8 2.8C9.5 2.8 10.8 4 10.8 5.6V7", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" },
          { d: "M4 7H12V13H4Z", fill: "currentColor", stroke: "currentColor", "stroke-width": "1.1", "stroke-linejoin": "round" },
        ]
      : [
          { d: "M10.8 7V5.5C10.8 4.2 9.7 3.1 8.4 3.1C7.6 3.1 6.9 3.5 6.4 4.1", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" },
          { d: "M4 7H12V13H4Z", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linejoin": "round" },
        ],
  );
}

function createSoloBadge(active) {
  const badge = document.createElement("span");
  badge.className = "timeline-track-solo";
  badge.textContent = "S";
  if (active) {
    badge.classList.add("is-active");
  }
  return badge;
}

function createHeaderButton({ kind, active, title, onClick }) {
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "timeline-track-badge";
  badge.dataset.flag = kind;
  badge.setAttribute("aria-label", title);
  badge.setAttribute("aria-pressed", active ? "true" : "false");
  badge.title = title;
  if (active) {
    badge.classList.add("is-active");
  }

  if (kind === "mute") {
    badge.appendChild(createMuteIcon(active));
  } else if (kind === "solo") {
    badge.appendChild(createSoloBadge(active));
  } else {
    badge.appendChild(createLockIcon(active));
  }

  badge.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.();
  });

  return badge;
}

function resolveClipAudioBuffer(track, clip, state, assetIndex) {
  if (track?.kind !== "audio" || !(state?.assetBuffers instanceof Map)) {
    return null;
  }

  const params = clip?.params && typeof clip.params === "object" ? clip.params : {};
  const assetId = typeof params.assetId === "string" && params.assetId.length > 0
    ? params.assetId
    : typeof clip?.assetId === "string" && clip.assetId.length > 0
      ? clip.assetId
      : null;

  if (assetId && assetIndex.byId.has(assetId)) {
    const asset = assetIndex.byId.get(assetId);
    const assetUrl = normalizeAudioUrl(asset?.path || asset?.url);
    return assetUrl ? state.assetBuffers.get(assetUrl) ?? null : null;
  }

  const clipUrl = normalizeAudioUrl(params.src ?? clip?.src ?? null);
  return clipUrl ? state.assetBuffers.get(clipUrl) ?? null : null;
}

export function createTrackRow(track, { duration, zoom, store }) {
  bindGlobalDropGhostCleanup();

  const safeDuration = Math.max(0, Number(duration) || 0);
  const laneWidth = Math.max(zoom.timeToPx(safeDuration), 1);
  const majorStep = getTickStep(zoom.pxPerSecond);
  const minorStep = majorStep === 1 ? 0.5 : majorStep === 5 ? 1 : 2;
  const assetIndex = createProjectAssetIndex(store?.state);

  const row = document.createElement("div");
  row.className = "timeline-track-row";
  row.dataset.trackId = track.id || "";
  row.style.gridTemplateColumns = `${TRACK_HEADER_WIDTH}px minmax(${laneWidth}px, 1fr)`;

  const header = document.createElement("div");
  header.className = "timeline-track-header";

  const copy = document.createElement("div");
  copy.className = "timeline-track-copy";

  const label = document.createElement("strong");
  label.textContent = track.label || track.name || "Track";

  const name = document.createElement("span");
  name.textContent = track.name || "";

  copy.append(label, name);

  const icons = document.createElement("div");
  icons.className = "timeline-track-actions";
  const toggleTrackFlag = (flag) => {
    if (!store?.dispatch || !track?.id) {
      return;
    }

    store.dispatch(setTrackFlagCommand({
      trackId: track.id,
      flag,
      value: !track?.[flag],
    }));
  };
  icons.append(
    createHeaderButton({
      kind: "mute",
      active: Boolean(track.muted),
      title: "Mute track (M)",
      onClick: () => toggleTrackFlag("muted"),
    }),
    createHeaderButton({
      kind: "solo",
      active: Boolean(track.solo),
      title: "Solo track (S)",
      onClick: () => toggleTrackFlag("solo"),
    }),
    createHeaderButton({
      kind: "lock",
      active: Boolean(track.locked),
      title: "Lock track (L)",
      onClick: () => toggleTrackFlag("locked"),
    }),
  );

  header.append(copy, icons);

  const lane = document.createElement("div");
  lane.className = "timeline-track-lane";
  lane.style.setProperty("--timeline-major-step", `${Math.max(zoom.timeToPx(majorStep), 1)}px`);
  lane.style.setProperty("--timeline-minor-step", `${Math.max(zoom.timeToPx(minorStep), 1)}px`);

  (track.clips || []).forEach((clip) => {
    const clipElement = createClip(clip, zoom, {
      trackKind: track.kind || "",
      audioBuffer: resolveClipAudioBuffer(track, clip, store?.state, assetIndex),
      store,
    });
    if (clip.id === pendingFlashClipId) {
      clipElement.classList.add("timeline-clip-flash");
      window.setTimeout(() => {
        clipElement.classList.remove("timeline-clip-flash");
        if (pendingFlashClipId === clip.id) {
          pendingFlashClipId = null;
        }
      }, CLIP_FLASH_MS);
    }
    lane.appendChild(clipElement);
  });

  const ghost = document.createElement("div");
  ghost.className = "timeline-drop-ghost";
  ghost.hidden = true;
  lane.appendChild(ghost);

  const accepts = resolveTrackAccepts(track.kind);

  function hideGhost() {
    hideGhostElement(ghost);
  }

  function updateGhost(event) {
    if (track.locked) {
      hideGhost();
      return;
    }

    const payload = readDragPayload(event.dataTransfer);
    if (!payload || !accepts.includes(payload.type)) {
      hideGhost();
      return;
    }

    const context = getDragDropContext();
    const preview = resolveDropPreview(payload, context);
    if (!preview) {
      hideGhost();
      return;
    }

    const rect = lane.getBoundingClientRect();
    const start = snapTime(zoom.pxToTime(event.clientX - rect.left));
    const width = Math.max(zoom.timeToPx(preview.dur), 44);

    ghost.hidden = false;
    ghost.textContent = preview.label;
    ghost.style.left = `${zoom.timeToPx(start)}px`;
    ghost.style.width = `${width}px`;
    ghost.classList.toggle("is-invalid", hasTrackOverlap(track, start, preview.dur));
  }

  registerDropTarget(lane, {
    accepts,
    canAccept() {
      return !track.locked;
    },
    onDrop(payload, event) {
      const context = getDragDropContext();
      const preview = resolveDropPreview(payload, context);
      hideGhost();
      if (!preview || !context.store) {
        return;
      }

      const rect = lane.getBoundingClientRect();
      const start = snapTime(zoom.pxToTime(event.clientX - rect.left));
      if (hasTrackOverlap(track, start, preview.dur)) {
        flashRejectedDrop(lane);
        return;
      }

      const clip = preview.buildClip(start);
      pendingFlashClipId = clip.id;
      context.store.addClip(track.id, clip);
      context.store.selectClip(clip.id);
    },
  });

  lane.addEventListener("dragover", updateGhost);
  lane.addEventListener("dragleave", (event) => {
    if (lane.contains(event.relatedTarget)) {
      return;
    }
    hideGhost();
  });
  lane.addEventListener("drop", hideGhost);

  row.append(header, lane);
  return row;
}

export { TRACK_HEADER_WIDTH };
