import { drawWaveform } from "../audio/waveform.js";
import { getClipLabelColor, normalizeClipLabel } from "../clip-labels.js";
import * as engine from "../engine/index.js";
import { SCENE_MANIFEST } from "../scenes/index.js";
import { attachClipInteractions } from "./clip-interact.js";

const CATEGORY_COLORS = {
  Audio: "#14b8a6",
  Backgrounds: "#3b82f6",
  Typography: "#a855f7",
  Shapes: "#06b6d4",
  "Shapes & Layout": "#06b6d4",
  DataViz: "#22c55e",
  "Data Viz": "#22c55e",
  Media: "#2563eb",
  Transitions: "#f59e0b",
  Overlays: "#ec4899",
};

const SCENE_META = new Map(SCENE_MANIFEST.map((scene) => [scene.id, scene]));
const AUDIO_CLIP_ACCENT = "#14b8a6";
const MIN_CLIP_WIDTH = 44;
const MIN_SCENE_THUMB_WIDTH = 48;
const CLIP_HEIGHT = 44;

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const numeric = Number.parseInt(value, 16);
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatAudioLabel(clip) {
  const params = clip?.params && typeof clip.params === "object" ? clip.params : {};
  const source = params.label || params.src || clip?.name || clip?.assetId || "";
  if (typeof source !== "string" || source.length === 0) {
    return "Audio clip";
  }

  const [lastSegment] = source.split(/[\\/]/).slice(-1);
  return lastSegment || source;
}

function cloneValue(value) {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function createSceneThumbnailTimeline(clip, duration) {
  const start = Math.max(0, Number(clip.start) || 0);
  const safeDuration = Math.max(Number(duration) || 0, 0.25);
  const clipId = clip.id || clip.scene || "timeline-thumb";

  return {
    version: "1",
    duration: Math.max(start + safeDuration, safeDuration),
    background: "#0b0b14",
    tracks: [
      {
        id: `timeline-thumb-track-${clipId}`,
        kind: "video",
        clips: [
          {
            id: `timeline-thumb-clip-${clipId}`,
            start,
            dur: safeDuration,
            scene: clip.scene,
            params: cloneValue(clip.params || {}),
          },
        ],
      },
    ],
  };
}

function renderWaveform(canvas, audioBuffer, width, height) {
  const dpr = Number(globalThis.devicePixelRatio) > 0 ? Number(globalThis.devicePixelRatio) : 1;
  const displayWidth = Math.max(1, Math.round(width));
  const displayHeight = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");

  canvas.width = Math.max(1, Math.round(displayWidth * dpr));
  canvas.height = Math.max(1, Math.round(displayHeight * dpr));
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  if (!ctx) {
    return;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, displayWidth, displayHeight);
  drawWaveform(ctx, audioBuffer, 0, 0, displayWidth, displayHeight, "rgba(229, 255, 252, 0.72)");
}

function renderSceneThumbnail(canvas, clip, width, height) {
  if (!canvas || typeof canvas.getContext !== "function") {
    return false;
  }

  const sceneId = typeof clip?.scene === "string" ? clip.scene : "";
  const displayWidth = Math.max(1, Math.round(width));
  const displayHeight = Math.max(1, Math.round(height));
  const duration = Number(clip?.duration ?? clip?.dur) || 0;

  if (displayWidth < MIN_SCENE_THUMB_WIDTH || !sceneId || !engine.SCENES.has(sceneId)) {
    return false;
  }

  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  try {
    const ctx = engine.setupDPR(canvas);
    const timeline = createSceneThumbnailTimeline(clip, duration);
    const heroTime = (Number(clip.start) || 0) + Math.max(duration, 0) * 0.5;
    engine.renderAt(ctx, timeline, heroTime);
    return true;
  } catch {
    return false;
  }
}

function mountSceneThumbnail(element, clip, width) {
  const canvas = document.createElement("canvas");
  canvas.className = "timeline-clip-thumb";
  canvas.setAttribute("aria-hidden", "true");

  let lastWidth = -1;
  const syncThumbnail = (nextWidth) => {
    const displayWidth = Math.max(0, Math.round(nextWidth));
    if (displayWidth === lastWidth) {
      return;
    }

    lastWidth = displayWidth;
    const rendered = renderSceneThumbnail(canvas, clip, displayWidth, CLIP_HEIGHT);
    canvas.hidden = !rendered;
    element.classList.toggle("has-thumbnail", rendered);
  };

  syncThumbnail(width);

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver((entries) => {
      const [entry] = entries;
      const nextWidth = entry?.contentRect?.width ?? element.clientWidth ?? width;
      syncThumbnail(nextWidth);
    });
    resizeObserver.observe(element);
  }

  return canvas;
}

export function createClip(clip, zoom, options = {}) {
  const { trackKind = "", audioBuffer = null, store = null } = options && typeof options === "object" ? options : {};
  const scene = typeof clip.scene === "string" ? SCENE_META.get(clip.scene) : null;
  const category = clip.category || scene?.category || "";
  const labelText = trackKind === "audio"
    ? formatAudioLabel(clip)
    : clip.name || scene?.name || clip.scene || clip.assetId || "Untitled clip";
  const duration = Number(clip.duration ?? clip.dur) || 0;
  const element = document.createElement("div");
  const accent = trackKind === "audio"
    ? AUDIO_CLIP_ACCENT
    : CATEGORY_COLORS[category] || CATEGORY_COLORS.Backgrounds;
  const colorLabel = normalizeClipLabel(clip.label);
  const colorLabelStripe = getClipLabelColor(colorLabel);
  const width = Math.max(zoom.timeToPx(duration), MIN_CLIP_WIDTH);

  element.className = "timeline-clip";
  element.dataset.clipId = clip.id || "";
  element.dataset.category = category;
  element.dataset.colorLabel = colorLabel || "none";
  element.dataset.trackKind = trackKind;
  element.style.left = `${zoom.timeToPx(clip.start)}px`;
  element.style.width = `${width}px`;
  element.style.setProperty("--clip-accent", accent);
  element.style.setProperty("--clip-fill-start", hexToRgba(accent, 0.48));
  element.style.setProperty("--clip-fill-end", hexToRgba(accent, 0.2));
  element.title = labelText;

  if (trackKind === "audio") {
    element.classList.add("is-audio");
  }

  if (colorLabelStripe) {
    const stripe = document.createElement("span");
    stripe.className = "timeline-clip-label-stripe";
    stripe.setAttribute("aria-hidden", "true");
    stripe.style.backgroundColor = colorLabelStripe;
    element.appendChild(stripe);
  }

  const preview = document.createElement("span");
  preview.className = "timeline-clip-preview";
  preview.setAttribute("aria-hidden", "true");

  const leftHandle = document.createElement("span");
  leftHandle.className = "timeline-clip-handle timeline-clip-handle-left";
  leftHandle.setAttribute("aria-hidden", "true");

  if (trackKind === "audio" && audioBuffer) {
    const waveform = document.createElement("canvas");
    waveform.className = "timeline-clip-waveform";
    renderWaveform(waveform, audioBuffer, width, CLIP_HEIGHT);
    element.appendChild(waveform);
  }

  if (trackKind !== "audio") {
    element.appendChild(mountSceneThumbnail(element, clip, width));
  }

  const label = document.createElement("span");
  label.className = "timeline-clip-label";
  label.textContent = labelText;

  const rightHandle = document.createElement("span");
  rightHandle.className = "timeline-clip-handle timeline-clip-handle-right";
  rightHandle.setAttribute("aria-hidden", "true");

  element.append(preview, leftHandle, label, rightHandle);
  attachClipInteractions(element, clip.id || "", store, zoom);
  return element;
}

export { CATEGORY_COLORS };
