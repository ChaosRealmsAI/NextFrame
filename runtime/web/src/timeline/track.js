import { createProjectAssetIndex, normalizeAudioUrl } from "../audio/buffer.js";
import { createClip } from "./clip.js";
import { getTickStep } from "./ruler.js";

const TRACK_HEADER_WIDTH = 120;

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
          { d: "M3 6H5.5L9 3.5V12.5L5.5 10H3Z", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linejoin": "round" },
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
          { d: "M5 7V5.5C5 3.8 6.3 2.5 8 2.5C9.7 2.5 11 3.8 11 5.5V7", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" },
          { d: "M4 7H12V13H4Z", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linejoin": "round" },
        ]
      : [
          { d: "M10.8 7V5.5C10.8 4.2 9.7 3.1 8.4 3.1C7.6 3.1 6.9 3.5 6.4 4.1", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" },
          { d: "M4 7H12V13H4Z", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linejoin": "round" },
        ],
  );
}

function createHeaderIcon(kind, active) {
  const badge = document.createElement("span");
  badge.className = "timeline-track-badge";
  if (active) {
    badge.classList.add("is-active");
  }

  badge.appendChild(kind === "mute" ? createMuteIcon(active) : createLockIcon(active));
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
  icons.append(createHeaderIcon("mute", Boolean(track.muted)), createHeaderIcon("lock", Boolean(track.locked)));

  header.append(copy, icons);

  const lane = document.createElement("div");
  lane.className = "timeline-track-lane";
  lane.style.setProperty("--timeline-major-step", `${Math.max(zoom.timeToPx(majorStep), 1)}px`);
  lane.style.setProperty("--timeline-minor-step", `${Math.max(zoom.timeToPx(minorStep), 1)}px`);

  (track.clips || []).forEach((clip) => {
    lane.appendChild(createClip(clip, zoom, {
      trackKind: track.kind || "",
      audioBuffer: resolveClipAudioBuffer(track, clip, store?.state, assetIndex),
    }));
  });

  row.append(header, lane);
  return row;
}

export { TRACK_HEADER_WIDTH };
